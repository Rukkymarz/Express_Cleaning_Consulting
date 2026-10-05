<?php

use App\Services\QuoteNotificationDispatcher;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schedule;

Schedule::call(fn () => app(\App\Services\CampaignService::class)->dispatchDue())->name('campaigns.dispatch-due')->everyMinute()->withoutOverlapping();

Artisan::command('quote-notifications:recover {--limit=50}', function () {
    $dispatcher = app(QuoteNotificationDispatcher::class);
    $limit = max(1, min(250, (int) $this->option('limit')));
    $queuedBefore = now()->subMinute();
    $staleBefore = now()->subMinutes(10);
    // Resend's provider idempotency window is 24 hours. Stop automatic
    // delivery before that boundary so an old ambiguous result is never sent
    // again after provider deduplication has expired.
    $providerIdempotencyCutoff = now()->subHours(23);
    $expired = DB::table('quote_request_notifications')
        ->whereIn('status', ['queued', 'sending', 'retrying'])
        ->where('attempts', '>', 0)
        ->whereNotNull('last_attempt_at')
        ->where('last_attempt_at', '<=', $providerIdempotencyCutoff)
        ->update([
            'status' => 'needs_reconciliation',
            'failure_reason' => 'provider_idempotency_window_expired',
            'updated_at' => now(),
        ]);
    if ($expired > 0) {
        Log::warning('Old quote notification attempts require reconciliation before any resend.', [
            'notification_count' => $expired,
        ]);
    }

    $notificationIds = DB::table('quote_request_notifications')
        ->where(function ($query) use ($queuedBefore, $staleBefore, $providerIdempotencyCutoff) {
            $query->where(fn ($queued) => $queued->where('status', 'queued')->where('attempts', 0)->where('created_at', '<=', $queuedBefore))
                ->orWhere(fn ($undelivered) => $undelivered->where('status', 'retrying')->where('attempts', 0)->where('updated_at', '<=', $staleBefore))
                ->orWhere(fn ($stale) => $stale->whereIn('status', ['sending', 'retrying'])->where('attempts', '>', 0)
                    ->where('last_attempt_at', '>', $providerIdempotencyCutoff)->where('updated_at', '<=', $staleBefore));
        })
        ->orderBy('id')
        ->limit($limit)
        ->pluck('id');

    $dispatched = 0;
    foreach ($notificationIds as $notificationId) {
        $serviceRequestId = DB::transaction(function () use ($notificationId, $queuedBefore, $staleBefore, $providerIdempotencyCutoff) {
            $notification = DB::table('quote_request_notifications')->where('id', $notificationId)->lockForUpdate()->first();
            if (!$notification) return null;

            $queued = $notification->status === 'queued' && (int) $notification->attempts === 0
                && CarbonImmutable::parse($notification->created_at)->lte($queuedBefore);
            $undelivered = $notification->status === 'retrying' && (int) $notification->attempts === 0
                && CarbonImmutable::parse($notification->updated_at)->lte($staleBefore);
            $stale = in_array($notification->status, ['sending', 'retrying'], true)
                && (int) $notification->attempts > 0
                && $notification->last_attempt_at
                && CarbonImmutable::parse($notification->last_attempt_at)->gt($providerIdempotencyCutoff)
                && CarbonImmutable::parse($notification->updated_at)->lte($staleBefore);
            if (!$queued && !$undelivered && !$stale) return null;

            // Claim the recovery window so the one-minute loop cannot keep
            // appending duplicate jobs while the queue is backed up.
            DB::table('quote_request_notifications')->where('id', $notification->id)->update([
                'status' => 'retrying',
                'updated_at' => now(),
            ]);

            return (int) $notification->service_request_id;
        });
        if (!$serviceRequestId) continue;

        try {
            $dispatcher->dispatch($serviceRequestId);
            $dispatched++;
        } catch (\Throwable $error) {
            DB::table('quote_request_notifications')->where('service_request_id', $serviceRequestId)
                ->where('status', 'retrying')->where('attempts', 0)->update([
                    'status' => 'queued',
                    'updated_at' => now(),
                ]);
            Log::error('A queued quote notification could not be recovered.', [
                'service_request_id' => $serviceRequestId,
                'exception_class' => $error::class,
            ]);
        }
    }

    $this->info("Dispatched {$dispatched} quote notification recovery job(s).");
})->purpose('Recover quote notifications that were not queued or whose provider result stalled.');

Artisan::command('prospects:remind {--dry-run}', function () {
    $this->info(json_encode(app(\App\Services\ProspectReminderService::class)->run((bool)$this->option('dry-run'))));
})->purpose('Send one weekday outreach reminder to Christine after 9 AM Eastern when work is available.');
