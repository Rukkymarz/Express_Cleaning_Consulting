<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ServicePlanController extends Controller
{
    public function index(Request $request) {
        $plans=DB::table('service_plans as p')->join('bookings as b','b.id','=','p.originating_booking_id')
            ->where('p.customer_id',$request->user()->id)->orderByDesc('p.id')
            ->get(['p.id','p.public_id','p.frequency','p.status','p.next_service_on','b.public_id as booking_id']);
        $pending=DB::table('plan_change_requests')->whereIn('service_plan_id',$plans->pluck('id'))
            ->where('status','pending')->get(['service_plan_id','action','created_at']);
        return response()->json(['plans'=>$plans,'pending_requests'=>$pending]);
    }
    public function requestChange(Request $request, string $publicId) {
        $v=$request->validate(['action'=>'required|in:pause,resume,cancel','reason'=>'nullable|string|max:1000']);
        $receipt=DB::transaction(function() use($request,$publicId,$v) {
            $plan=DB::table('service_plans')->where('public_id',$publicId)->where('customer_id',$request->user()->id)->lockForUpdate()->first(); abort_unless($plan,404);
            abort_if($plan->status==='cancelled' || ($v['action']==='pause'&&$plan->status!=='active') || ($v['action']==='resume'&&$plan->status!=='paused'),409,'This change is unavailable');
            abort_if(DB::table('plan_change_requests')->where('service_plan_id',$plan->id)->where('status','pending')->exists(),409,'A change is already pending');
            $id=DB::table('plan_change_requests')->insertGetId(['service_plan_id'=>$plan->id,'requested_by'=>$request->user()->id,'action'=>$v['action'],'status'=>'pending','reason'=>$v['reason']??null,'created_at'=>now(),'updated_at'=>now()]);
            return ['request_id'=>$id,'status'=>'pending_review'];
        });
        return response()->json($receipt,202);
    }
    public function createFromBooking(Request $request, int $bookingId) {
        $v=$request->validate(['next_service_on'=>'nullable|date|after:today','customer_approved'=>'required|accepted']);
        $booking=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')
            ->join('service_requests as sr','sr.id','=','q.service_request_id')->where('b.id',$bookingId)
            ->first(['b.id','b.customer_id','b.status','sr.frequency']);
        abort_unless($booking,404); abort_unless($booking->customer_id && $booking->status==='completed' && !in_array($booking->frequency,['one_time','as_needed'],true),409,'A completed recurring service is required');
        $id=(string)Str::ulid();
        $created=DB::table('service_plans')->insertOrIgnore(['public_id'=>$id,'customer_id'=>$booking->customer_id,'originating_booking_id'=>$bookingId,'frequency'=>$booking->frequency,'status'=>'active','next_service_on'=>$v['next_service_on']??null,'created_at'=>now(),'updated_at'=>now()]);
        if($created) DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'service_plan','entity_id'=>DB::table('service_plans')->where('originating_booking_id',$bookingId)->value('id'),'action'=>'created.with_customer_approval','created_at'=>now(),'updated_at'=>now()]);
        return response()->json(['status'=>'active','plan'=>DB::table('service_plans')->where('originating_booking_id',$bookingId)->first()],201);
    }
    public function resolve(Request $request, int $changeId) {
        $v=$request->validate(['decision'=>'required|in:approve,decline','next_service_on'=>'nullable|date|after:today']);
        $result=DB::transaction(function() use($request,$changeId,$v) {
            $change=DB::table('plan_change_requests')->where('id',$changeId)->lockForUpdate()->first(); abort_unless($change,404); abort_unless($change->status==='pending',409);
            $plan=DB::table('service_plans')->where('id',$change->service_plan_id)->lockForUpdate()->first();
            abort_unless($plan && $plan->status!=='cancelled' && ($change->action==='cancel' || ($change->action==='pause' && $plan->status==='active') || ($change->action==='resume' && $plan->status==='paused')),409,'Plan state changed');
            if($v['decision']==='approve') DB::table('service_plans')->where('id',$plan->id)->update(['status'=>['pause'=>'paused','resume'=>'active','cancel'=>'cancelled'][$change->action],'next_service_on'=>$v['next_service_on']??$plan->next_service_on,'updated_at'=>now()]);
            DB::table('plan_change_requests')->where('id',$changeId)->update(['status'=>$v['decision']==='approve'?'approved':'declined','resolved_by'=>$request->user()->id,'resolved_at'=>now(),'updated_at'=>now()]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'service_plan','entity_id'=>$plan->id,'action'=>'change.'.$v['decision'],'changes'=>json_encode(['requested_action'=>$change->action]),'created_at'=>now(),'updated_at'=>now()]);
            return ['status'=>$v['decision']==='approve'?'approved':'declined'];
        });
        return response()->json($result);
    }
}
