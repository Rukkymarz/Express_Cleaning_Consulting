<?php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use App\Services\ReviewMailer;

/** One attempted message per completed booking; ambiguous provider results need manual reconciliation. */
class SendPostServiceReviewEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 30;

    public function __construct(public int $bookingId) {}

    public function handle(ReviewMailer $mailer): void
    {
        $recipient = DB::transaction(function () {
            $record = DB::table('review_requests')->where('booking_id', $this->bookingId)->lockForUpdate()->first();
            if (!$record || $record->status !== 'queued') return null;
            $booking = DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')
                ->join('service_requests as sr','sr.id','=','q.service_request_id')
                ->join('leads as l','l.id','=','sr.lead_id')
                ->where('b.id',$this->bookingId)->first(['b.status','l.id as lead_id','l.name','l.email']);
            $consent = $booking ? DB::table('consents')->where('lead_id',$booking->lead_id)
                ->where('channel','review_email')->orderByDesc('id')->value('granted') : false;
            $cfg = config('services.reviews');
            $url = $cfg['url'];
            $ready = is_string($url) && filter_var($url,FILTER_VALIDATE_URL)
                && parse_url($url, PHP_URL_SCHEME) === 'https' && $cfg['resend_key'] && $cfg['from'];
            if (!$booking || $booking->status !== 'completed' || !$booking->email || !$consent || !$ready) {
                DB::table('review_requests')->where('id',$record->id)->update(['status'=>'suppressed','reason'=>'ineligible_or_unconfigured','updated_at'=>now()]);
                return null;
            }
            // Commit a durable claim before the external call. A timeout cannot safely be retried blind.
            DB::table('review_requests')->where('id',$record->id)->update(['status'=>'sending','updated_at'=>now()]);
            return ['email'=>$booking->email,'name'=>$booking->name,'url'=>$url,'key'=>$cfg['resend_key'],'from'=>$cfg['from']];
        });
        if (!$recipient) return;

        try {
            $messageId=$mailer->send($recipient['key'],$recipient['from'],$recipient['email'],$recipient['name'],$recipient['url'],$this->bookingId);
            DB::table('review_requests')->where('booking_id',$this->bookingId)->update([
                'status'=>'sent','provider_message_id'=>$messageId,'sent_at'=>now(),
                'reason'=>null,'updated_at'=>now(),
            ]);
        } catch (\Throwable $error) {
            DB::table('review_requests')->where('booking_id',$this->bookingId)->update([
                'status'=>'needs_reconciliation','reason'=>'provider_result_unknown','updated_at'=>now(),
            ]);
            report($error);
        }
    }
}
