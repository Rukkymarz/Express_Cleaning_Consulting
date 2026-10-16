<?php
namespace App\Jobs;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
class SendLaunchMail implements ShouldQueue {
 use Dispatchable,InteractsWithQueue,Queueable,SerializesModels;
 public int $tries=3;public int $timeout=30;public array $backoff=[30,120];
 public function __construct(public int $outboxId){}
 public function handle():void {
  $message=DB::transaction(function(){
   $m=DB::table('launch_mail_outbox')->where('id',$this->outboxId)->lockForUpdate()->first();
   if(!$m||!in_array($m->status,['queued','retrying'],true))return null;
   if($m->first_attempt_at&&Carbon::parse($m->first_attempt_at)->lte(now()->subHours(23))){DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'needs_reconciliation','failure_reason'=>'idempotency_window_expired','updated_at'=>now()]);return null;}
   if((int)$m->attempts>=3){DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'needs_reconciliation','failure_reason'=>'attempt_limit','updated_at'=>now()]);return null;}
   $config=config('services.quote_notifications');
   if(empty($config['resend_key'])||!filter_var($config['from']??null,FILTER_VALIDATE_EMAIL)) {DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'blocked','failure_reason'=>'mail_configuration_missing','updated_at'=>now()]);return null;}
   DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'sending','attempts'=>$m->attempts+1,'first_attempt_at'=>$m->first_attempt_at?:now(),'updated_at'=>now()]);
   return ['row'=>$m,'config'=>$config];
  });
  if(!$message)return;
  $m=$message['row'];$config=$message['config'];
  try{$result=\Resend::client($config['resend_key'])->emails->send(['from'=>$config['from'],'to'=>[$m->recipient],'reply_to'=>'support@expresscleaningconsult.com','subject'=>$m->subject,'text'=>$m->body],['idempotency_key'=>$m->message_key]);DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'sent','provider_message_id'=>$result->id,'sent_at'=>now(),'failure_reason'=>null,'updated_at'=>now()]);}
  catch(\Throwable $e){DB::table('launch_mail_outbox')->where('id',$m->id)->update(['status'=>'retrying','failure_reason'=>'provider_error','updated_at'=>now()]);throw $e;}
 }
 public function failed(?\Throwable $e):void {DB::table('launch_mail_outbox')->where('id',$this->outboxId)->where('status','!=','sent')->update(['status'=>'needs_reconciliation','failure_reason'=>'retries_exhausted','updated_at'=>now()]);}
}
