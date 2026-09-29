<?php
namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** A deterministic work-priority score, never a conversion probability. */
class LeadService
{
    public function sync(int $leadId): void
    {
        DB::transaction(function () use ($leadId) {
            $lead = DB::table('leads')->where('id', $leadId)->lockForUpdate()->first();
            if (!$lead) return;

            $requests = DB::table('service_requests')->where('lead_id', $leadId);
            $latest = (clone $requests)->orderByDesc('id')->first();
            $quoteBase = DB::table('quotes as q')
                ->join('service_requests as sr', 'sr.id', '=', 'q.service_request_id')
                ->where('sr.lead_id', $leadId)->where('sr.id',$latest?->id ?? 0);
            $bookingBase = DB::table('bookings as b')
                ->join('quotes as q', 'q.id', '=', 'b.quote_id')
                ->join('service_requests as sr', 'sr.id', '=', 'q.service_request_id')
                ->where('sr.lead_id', $leadId)->where('sr.id',$latest?->id ?? 0);

            $hasCompleted = (clone $bookingBase)->where('b.status', 'completed')->exists();
            $hasBooked = (clone $bookingBase)->whereIn('b.status', ['scheduled', 'in_progress', 'quality_review', 'rework'])->exists();
            $hasSentQuote = (clone $quoteBase)->whereIn('q.status', ['sent', 'accepted'])->exists();
            $hasAcceptedQuote = (clone $quoteBase)->where('q.status', 'accepted')->exists();
            $stage = $hasCompleted ? 'completed' : ($hasBooked ? 'booked' : ($hasSentQuote ? 'quote_sent' : ($latest ? 'quote_requested' : 'new_lead')));

            $score = 0;
            if ($lead->email) $score += 10;
            if ($lead->phone) $score += 10;
            if ($latest) {
                $score += 20; // Specific service and address were submitted.
                if ($latest->square_feet || $latest->scope_notes) $score += 10;
                if ($latest->preferred_start_at) {
                    $score += 10;
                    $preferred=CarbonImmutable::parse($latest->preferred_start_at);
                    if ($preferred->greaterThanOrEqualTo(now()) && $preferred->lessThanOrEqualTo(now()->addDays(14))) $score += 10;
                }
            }
            if ($hasSentQuote) $score += 10;
            if ($hasAcceptedQuote) $score += 10;
            if (DB::table('calls')->where('lead_id', $leadId)->whereIn('disposition', ['interested', 'follow_up'])->exists()) $score += 10;
            // Closed records remain visible in reports but do not jump the active call queue.
            if ($lead->status === 'lost' || $stage === 'completed') $score = 0;

            DB::table('leads')->where('id', $leadId)->update([
                'pipeline_stage' => $stage, 'lead_score' => min(100, $score),
                'scored_at' => now(), 'updated_at' => now(),
            ]);
        });
    }
}
