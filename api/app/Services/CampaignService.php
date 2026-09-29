<?php
namespace App\Services;

use App\Jobs\SendCampaignDelivery;
use Illuminate\Support\Facades\DB;

class CampaignService
{
    public function dispatchDue(): void
    {
        $campaigns=DB::table('campaigns')->where('status','approved')->where('scheduled_at','<=',now())->limit(20)->get();
        foreach($campaigns as $campaign) {
            DB::transaction(function() use ($campaign) {
                $changed=DB::table('campaigns')->where('id',$campaign->id)->where('status','approved')->update(['status'=>'dispatching','updated_at'=>now()]);
                if(!$changed) return;
                $channel=$campaign->channel==='email'?'marketing_email':'marketing_sms';
                $query=DB::table('leads as l')->whereNotNull($campaign->channel==='email'?'l.email':'l.phone')
                    ->whereExists(function($q) use($channel) { $q->selectRaw('1')->from('consents as c')->whereColumn('c.lead_id','l.id')->where('c.channel',$channel)->where('c.granted',true)->whereRaw('c.id = (select max(c2.id) from consents c2 where c2.lead_id=l.id and c2.channel=c.channel)'); });
                if($campaign->kind==='idle_follow_up') {
                    $query->whereIn('l.status',['new','contacted','qualified','follow_up'])->where('l.created_at','<=',now()->subDays(3))
                      ->whereNotExists(fn($q)=>$q->selectRaw('1')->from('service_requests as sr')->join('quotes as qt','qt.service_request_id','=','sr.id')->whereColumn('sr.lead_id','l.id')->where('qt.status','accepted'));
                } else {
                    $query->whereExists(fn($q)=>$q->selectRaw('1')->from('service_requests as sr')->join('quotes as qt','qt.service_request_id','=','sr.id')->join('bookings as b','b.quote_id','=','qt.id')->whereColumn('sr.lead_id','l.id')->where('b.status','completed'));
                }
                $query->orderBy('l.id')->select('l.id')->chunkById(500,function($leads) use($campaign) {
                    foreach($leads as $lead) {
                        $id=DB::table('campaign_deliveries')->insertOrIgnore(['campaign_id'=>$campaign->id,'lead_id'=>$lead->id,'status'=>'queued','created_at'=>now(),'updated_at'=>now()]);
                        if($id) { $deliveryId=DB::table('campaign_deliveries')->where('campaign_id',$campaign->id)->where('lead_id',$lead->id)->value('id'); SendCampaignDelivery::dispatch($deliveryId)->afterCommit(); }
                    }
                },'l.id','id');
                DB::table('campaigns')->where('id',$campaign->id)->update(['status'=>'dispatched','updated_at'=>now()]);
            });
        }
    }
}
