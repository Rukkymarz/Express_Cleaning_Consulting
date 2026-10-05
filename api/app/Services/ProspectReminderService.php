<?php
namespace App\Services;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
class ProspectReminderService {
 public function run(bool $dryRun=false): array {
  $local=CarbonImmutable::now('America/New_York');
  if($local->isWeekend()||$local->hour<9)return ['eligible'=>0,'accepted'=>0,'dry_run'=>$dryRun];
  $key=config('services.quote_notifications.resend_key');$from=config('services.quote_notifications.from');
  if(!$key||!$from)return ['eligible'=>0,'accepted'=>0,'configured'=>false,'dry_run'=>$dryRun];
  $eligible=0;$accepted=0;
  foreach(User::permission('leads.edit')->where('email','christinewealth789@gmail.com')->get() as $agent){
   $base=DB::table('sales_prospects')->where('assigned_agent_id',$agent->id);
   $new=(clone $base)->where('status','new')->count();
   $due=(clone $base)->whereNotIn('status',['do_not_contact','not_interested','converted'])->whereNotNull('next_follow_up_at')->where('next_follow_up_at','<=',$local->endOfDay()->utc())->count();
   $quotes=DB::table('leads')->where('pipeline_stage','quote_requested')->whereNotIn('status',['lost'])->where(fn($q)=>$q->where('assigned_agent_id',$agent->id)->orWhereNull('assigned_agent_id'))->count();
   if($new+$due+$quotes===0)continue;$eligible++;
   if($dryRun)continue;
   $claim=DB::table('prospect_reminders')->insertOrIgnore(['user_id'=>$agent->id,'work_date'=>$local->toDateString(),'status'=>'sending','created_at'=>now(),'updated_at'=>now()]);
   if(!$claim)continue;
   $row=DB::table('prospect_reminders')->where('user_id',$agent->id)->where('work_date',$local->toDateString());
   try {
    $response=Http::withToken($key)->withHeaders(['Idempotency-Key'=>'prospect-reminder-'.$agent->id.'-'.$local->toDateString()])->timeout(20)->post('https://api.resend.com/emails',[
     'from'=>$from,'to'=>[$agent->email],'subject'=>'Your daily Express Cleaning lead follow-ups',
     'text'=>"Hi Christine,\n\nYour outreach workspace is ready.\nNew assigned prospects: $new\nFollow-ups due today or overdue: $due\nQuote requests to review (assigned to you or unassigned): $quotes\n\nPriority: Georgia, then Michigan, then nationwide. Residential and commercial are equally important.\n\nReview sources, contact preferences and do-not-contact status before reaching out. Record each result and the next follow-up. No customer email or call is sent by this reminder.\n\nLead generation: https://www.expresscleaningconsult.com/admin/prospects\nQuote requests: https://www.expresscleaningconsult.com/admin\n"
    ]);
    $id=$response->json('id');
    if($response->successful()&&is_string($id)&&$id!==''){$row->update(['status'=>'sent','provider_message_id'=>$id,'updated_at'=>now()]);$accepted++;}
    else {$row->update(['status'=>'needs_reconciliation','updated_at'=>now()]);Log::warning('Prospect reminder requires provider review',['user_id'=>$agent->id,'http_status'=>$response->status()]);}
   }catch(\Throwable $e){$row->update(['status'=>'needs_reconciliation','updated_at'=>now()]);Log::warning('Prospect reminder outcome uncertain',['user_id'=>$agent->id,'exception_class'=>$e::class]);}
  }
  return ['eligible'=>$eligible,'accepted'=>$accepted,'dry_run'=>$dryRun];
 }
}
