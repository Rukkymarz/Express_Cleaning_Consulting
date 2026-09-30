<?php

namespace App\Jobs;

use App\Services\QuoteRequestMailer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/** A provider-idempotent, single-recipient notification for one saved quote request. */
class SendQuoteRequestNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 30;
    public array $backoff = [30, 120];

    public string $attemptToken;

    public function __construct(public int $serviceRequestId, ?string $attemptToken = null)
    {
        $this->attemptToken = $attemptToken ?: (string) Str::uuid();
    }

    public function handle(QuoteRequestMailer $mailer): void
    {
        $message = DB::transaction(function () {
            $notification = DB::table('quote_request_notifications')
                ->where('service_request_id', $this->serviceRequestId)
                ->lockForUpdate()
                ->first();

            // Only one queued job may claim the outbox row. A duplicate job sees
            // `sending` and exits; a stale sender is moved back to `retrying` by
            // the recovery command before a replacement job is dispatched.
            if (!$notification || !in_array($notification->status, ['queued', 'retrying'], true)) {
                return null;
            }

            // Resend only guarantees provider-side idempotency for 24 hours. A retry
            // job can itself be delayed, so enforce the safety window again at the
            // final locked claim instead of relying only on the recovery command.
            if (
                (int) $notification->attempts > 0
                && $notification->last_attempt_at
                && Carbon::parse($notification->last_attempt_at)->lte(now()->subHours(23))
            ) {
                DB::table('quote_request_notifications')->where('id', $notification->id)->update([
                    'status' => 'needs_reconciliation',
                    'failure_reason' => 'provider_idempotency_window_expired',
                    'updated_at' => now(),
                ]);
                Log::warning('Quote notification retry was held because the provider idempotency window may have expired.', [
                    'service_request_id' => $this->serviceRequestId,
                ]);
                return null;
            }

            $details = json_decode((string) $notification->payload, true);

            $config = config('services.quote_notifications');
            $configured = is_array($details)
                && collect(['receipt', 'customer_name', 'email', 'phone', 'service', 'location', 'task_status', 'review_url'])
                    ->every(fn ($key) => isset($details[$key]) && is_string($details[$key]) && $details[$key] !== '')
                && is_string($config['resend_key'] ?? null) && $config['resend_key'] !== ''
                && filter_var($config['from'] ?? null, FILTER_VALIDATE_EMAIL)
                && filter_var($config['to'] ?? null, FILTER_VALIDATE_EMAIL)
                && filter_var($details['review_url'] ?? null, FILTER_VALIDATE_URL)
                && parse_url($details['review_url'], PHP_URL_SCHEME) === 'https';

            if (!$configured) {
                DB::table('quote_request_notifications')->where('id', $notification->id)->update([
                    'status' => 'failed',
                    'failure_reason' => 'notification_provider_or_verified_sender_not_configured',
                    'updated_at' => now(),
                ]);
                Log::error('Quote notification was not sent because backend mail configuration is incomplete.', [
                    'service_request_id' => $this->serviceRequestId,
                ]);
                return null;
            }

            // Claim before the external call. Provider idempotency protects an intentional retry;
            // an ambiguous result is held for reconciliation instead of being sent twice blindly.
            DB::table('quote_request_notifications')->where('id', $notification->id)->update([
                'status' => 'sending',
                'attempts' => ((int) $notification->attempts) + 1,
                'attempt_token' => $this->attemptToken,
                'last_attempt_at' => now(),
                'failure_reason' => null,
                'updated_at' => now(),
            ]);

            return [
                'notification_id' => $notification->id,
                'key' => $config['resend_key'],
                'from' => $config['from'],
                'to' => $config['to'],
                'details' => $details,
            ];
        });

        if (!$message) {
            return;
        }

        try {
            $messageId = $mailer->send(
                $message['key'],
                $message['from'],
                $message['to'],
                $message['details'],
            );
            DB::table('quote_request_notifications')->where('id', $message['notification_id'])
                ->where('status', 'sending')->where('attempt_token', $this->attemptToken)->update([
                'status' => 'sent',
                'provider_message_id' => $messageId,
                'sent_at' => now(),
                'failure_reason' => null,
                'updated_at' => now(),
            ]);
        } catch (\Throwable $error) {
            DB::table('quote_request_notifications')->where('id', $message['notification_id'])
                ->where('status', 'sending')->where('attempt_token', $this->attemptToken)->update([
                'status' => 'retrying',
                'failure_reason' => 'transient_or_ambiguous_provider_error',
                'updated_at' => now(),
            ]);
            Log::warning('Quote notification delivery failed and will retry with the same provider idempotency key.', [
                'service_request_id' => $this->serviceRequestId,
                'exception_class' => $error::class,
            ]);
            throw $error;
        }
    }

    public function failed(?\Throwable $error): void
    {
        DB::table('quote_request_notifications')->where('service_request_id', $this->serviceRequestId)
            ->where('attempt_token', $this->attemptToken)
            ->whereIn('status', ['queued', 'sending', 'retrying'])
            ->update([
                'status' => 'needs_reconciliation',
                'failure_reason' => 'provider_result_unknown_after_retries',
                'updated_at' => now(),
            ]);
        Log::error('Quote notification exhausted retry attempts and needs reconciliation.', [
            'service_request_id' => $this->serviceRequestId,
            'exception_class' => $error ? $error::class : null,
        ]);
    }
}
