<?php
namespace App\Services;
use App\Jobs\SendLaunchMail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
class LaunchMail {
 public function queue(string $key,string $to,string $subject,string $body):void {
  $now=now();DB::table('launch_mail_outbox')->insertOrIgnore(['message_key'=>$key,'recipient'=>$to,'subject'=>$subject,'body'=>$body,'status'=>'queued','created_at'=>$now,'updated_at'=>$now]);
  $id=DB::table('launch_mail_outbox')->where('message_key',$key)->value('id');
  DB::afterCommit(function()use($id){try{SendLaunchMail::dispatch((int)$id)->onConnection('database')->onQueue('quote-notifications');}catch(\Throwable $e){Log::error('Launch email remains queued for recovery.',['outbox_id'=>$id,'exception_class'=>$e::class]);}});
 }
}
