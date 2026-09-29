<?php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Twilio\Rest\Client as TwilioClient;

class SendCampaignDelivery implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public int $tries=3;
    public function __construct(public int $deliveryId) {}
    public function handle(): void {
        $delivery=DB::table('campaign_deliveries as d')->join('campaigns as ca','ca.id','=','d.campaign_id')->join('leads as l','l.id','=','d.lead_id')->where('d.id',$this->deliveryId)->first(['d.id','d.status','d.lead_id','ca.channel','ca.kind','l.email','l.phone','l.name']);
        if(!$delivery || $delivery->status!=='queued') return;
        $consentChannel=$delivery->channel==='email'?'marketing_email':'marketing_sms';
        $consent=DB::table('consents')->where('lead_id',$delivery->lead_id)->where('channel',$consentChannel)->orderByDesc('id')->value('granted');
        if(!$consent) { DB::table('campaign_deliveries')->where('id',$this->deliveryId)->update(['status'=>'suppressed','updated_at'=>now()]); return; }
        $review=$delivery->kind==='post_clean_review';
        $body=$review ? 'Thank you for choosing Express Cleaning Consult. We would appreciate your honest feedback about your recent cleaning.' : 'Hello, this is Express Cleaning Consult. If you still need cleaning, reply to your earlier request and we can discuss the details.';
        if($delivery->channel==='email') {
            $key=env('RESEND_API_KEY'); if(!$key) throw new \RuntimeException('Resend API key not configured');
            $response=Http::withToken($key)->withHeaders(['Idempotency-Key'=>'ecc-delivery-'.$this->deliveryId])->post('https://api.resend.com/emails',['from'=>env('MAIL_FROM_ADDRESS','support@expresscleaningconsult.com'),'to'=>[$delivery->email],'subject'=>$review?'How was your cleaning?':'Following up on your cleaning request','text'=>$body]);
            $response->throw(); $providerId=$response->json('id');
        } else {
            if(!config('services.twilio.sid') || !config('services.twilio.auth_token') || !config('services.twilio.number')) throw new \RuntimeException('SMS not configured');
            // Twilio Message creation has no corresponding idempotency key here. Claim once;
            // an uncertain failure remains in `sending` for manual provider reconciliation.
            $claimed=DB::table('campaign_deliveries')->where('id',$this->deliveryId)->where('status','queued')->update(['status'=>'sending','updated_at'=>now()]);
            if(!$claimed) return;
            $client=new TwilioClient(config('services.twilio.sid'),config('services.twilio.auth_token'));
            $message=$client->messages->create($delivery->phone,['from'=>config('services.twilio.number'),'body'=>$body.' Reply STOP to opt out.']);
            $providerId=$message->sid;
        }
        DB::table('campaign_deliveries')->where('id',$this->deliveryId)->whereIn('status',['queued','sending'])->update(['status'=>'sent','provider_message_id'=>$providerId,'sent_at'=>now(),'updated_at'=>now()]);
    }
}
