<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Twilio\Jwt\AccessToken;
use Twilio\Jwt\Grants\VoiceGrant;
use Twilio\Security\RequestValidator;
use Twilio\TwiML\VoiceResponse;

class VoiceController extends Controller
{
    public function token(Request $request) {
        $cfg=config('services.twilio'); abort_unless($cfg['sid'] && $cfg['api_key'] && $cfg['api_secret'] && $cfg['app_sid'],503,'Voice is not configured');
        $token=new AccessToken($cfg['sid'],$cfg['api_key'],$cfg['api_secret'],3600,'agent-'.$request->user()->id);
        $grant=new VoiceGrant(); $grant->setOutgoingApplicationSid($cfg['app_sid']); $grant->setIncomingAllow(true); $token->addGrant($grant);
        return response()->json(['token'=>$token->toJWT(),'identity'=>'agent-'.$request->user()->id,'expires_in'=>3600]);
    }
    public function presence(Request $request) {
        $v=$request->validate(['available'=>'required|boolean']);
        DB::table('agent_presence')->updateOrInsert(['agent_id'=>$request->user()->id],['available'=>$v['available'],'last_seen_at'=>now(),'updated_at'=>now()]);
        return response()->noContent();
    }
    private function verify(Request $request): void {
        abort_unless(config('services.twilio.auth_token'),503);
        $validator=new RequestValidator(config('services.twilio.auth_token'));
        abort_unless($validator->validate($request->header('X-Twilio-Signature',''),$request->fullUrl(),$request->post()),403,'Invalid Twilio signature');
    }
    public function outbound(Request $request) {
        $this->verify($request);
        $caller=$request->input('Caller','');
        abort_unless(preg_match('/^client:agent-([1-9][0-9]*)$/',$caller,$match)===1,403);
        $agent=\App\Models\User::find((int)$match[1]); abort_unless($agent?->can('calls.place'),403);
        $leadId=(int)$request->input('LeadId');
        $to=DB::table('leads')->where('id',$leadId)->value('phone');
        // Default US-only dialing; extend by reviewed market/country policy.
        abort_unless(is_string($to) && preg_match('/^\+1[2-9][0-9]{9}$/',$to)===1,422,'Lead must have a US E.164 number');
        $sid=$request->input('CallSid');
        if (is_string($sid) && preg_match('/^CA[a-f0-9]{32}$/i',$sid)) DB::table('calls')->updateOrInsert(['twilio_call_sid'=>$sid],['lead_id'=>$leadId,'agent_id'=>$agent->id,'direction'=>'outbound','from_number'=>config('services.twilio.number'),'to_number'=>$to,'status'=>'initiated','created_at'=>now(),'updated_at'=>now()]);
        $response=new VoiceResponse(); $dial=$response->dial('', ['callerId'=>config('services.twilio.number'),'action'=>url('/api/v1/webhooks/twilio/status'),'method'=>'POST']); $dial->number($to);
        return response((string)$response,200)->header('Content-Type','text/xml');
    }
    public function incoming(Request $request) {
        $this->verify($request);
        $response=new VoiceResponse();
        $agent=null;
        $activeIds=DB::table('agent_presence')->where('available',true)->where('last_seen_at','>',now()->subSeconds(45))->orderByDesc('last_seen_at')->limit(30)->pluck('agent_id');
        foreach($activeIds as $id) { $candidate=\App\Models\User::find($id); if($candidate?->can('calls.place')) { $agent=$candidate; break; } }
        if ($agent) {
            $sid=$request->input('CallSid');
            if(is_string($sid) && preg_match('/^CA[a-f0-9]{32}$/i',$sid)) {
                $phone=substr((string)$request->input('From',''),0,32);
                $leadId=DB::table('leads')->where('phone',$phone)->value('id');
                DB::table('calls')->insertOrIgnore(['twilio_call_sid'=>$sid,'lead_id'=>$leadId,'agent_id'=>$agent->id,'direction'=>'inbound','from_number'=>$phone,'to_number'=>substr((string)$request->input('To',''),0,32),'status'=>'ringing','created_at'=>now(),'updated_at'=>now()]);
            }
            $dial=$response->dial(); $dial->client('agent-'.$agent->id);
        }
        else $response->say('Thank you for calling Express Cleaning Consult. Our team is unavailable. Please try again later.');
        return response((string)$response,200)->header('Content-Type','text/xml');
    }
    public function status(Request $request) {
        $this->verify($request);
        $sid=$request->input('CallSid'); abort_unless(is_string($sid) && preg_match('/^CA[a-f0-9]{32}$/i',$sid),422);
        DB::table('calls')->insertOrIgnore(['twilio_call_sid'=>$sid,'direction'=>$request->input('Direction','unknown'),'from_number'=>substr((string)$request->input('From',''),0,32),'to_number'=>substr((string)$request->input('To',''),0,32),'status'=>'initiated','created_at'=>now(),'updated_at'=>now()]);
        DB::table('calls')->where('twilio_call_sid',$sid)->update(['status'=>substr((string)$request->input('CallStatus','unknown'),0,32),'updated_at'=>now()]);
        return response()->noContent();
    }
    public function incomingMessage(Request $request) {
        $this->verify($request);
        $body=strtoupper(trim((string)$request->input('Body','')));
        if(in_array($body,['STOP','UNSUBSCRIBE','CANCEL','END','QUIT'],true)) {
            $phone=$request->input('From');
            $leadIds=DB::table('leads')->where('phone',$phone)->pluck('id');
            foreach($leadIds as $leadId) DB::table('consents')->insert(['lead_id'=>$leadId,'channel'=>'marketing_sms','granted'=>false,'source'=>'twilio_inbound_opt_out','policy_version'=>'2026-09','recorded_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
        }
        return response('<Response/>',200)->header('Content-Type','text/xml');
    }
    public function note(Request $request, int $id) {
        $v=$request->validate(['notes'=>'required|string|max:5000','disposition'=>'required|in:interested,follow_up,booked,no_answer,not_interested,other']);
        $call=DB::table('calls')->where('id',$id)->where('agent_id',$request->user()->id)->first(); abort_unless($call,404);
        DB::table('calls')->where('id',$id)->update(['notes'=>$v['notes'],'disposition'=>$v['disposition'],'agent_id'=>$request->user()->id,'updated_at'=>now()]);
        if($call->lead_id) app(\App\Services\LeadService::class)->sync($call->lead_id);
        return response()->noContent();
    }
    public function list(Request $request) {
        return response()->json(DB::table('calls')->where('agent_id',$request->user()->id)->orderByDesc('id')->cursorPaginate(20,['id','lead_id','direction','to_number','status','disposition','notes','created_at']));
    }
}
