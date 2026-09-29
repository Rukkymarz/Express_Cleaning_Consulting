<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    public function transition(Request $request, int $id) {
        $v=$request->validate(['action'=>'required|in:start,submit_quality,complete,rework,cancel','notes'=>'nullable|string|max:2000']);
        $next=['ready_for_payment'=>['cancel'=>'cancelled'],'scheduled'=>['start'=>'in_progress','cancel'=>'cancelled'],'in_progress'=>['submit_quality'=>'quality_review'],'quality_review'=>['complete'=>'completed','rework'=>'rework'],'rework'=>['submit_quality'=>'quality_review']];
        $result=DB::transaction(function() use($request,$id,$v,$next) {
            $booking=DB::table('bookings')->where('id',$id)->lockForUpdate()->first();abort_unless($booking,404);
            $target=$next[$booking->status][$v['action']]??null;abort_unless($target,409,'Transition is not allowed');
            if($target==='completed') abort_unless($request->boolean('quality_confirmed'),422,'Quality review must be confirmed');
            DB::table('bookings')->where('id',$id)->update(['status'=>$target,'completed_at'=>$target==='completed'?now():$booking->completed_at,'updated_at'=>now()]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'booking','entity_id'=>$id,'action'=>$v['action'],'changes'=>json_encode(['from'=>$booking->status,'to'=>$target,'notes'=>$v['notes']??null]),'created_at'=>now(),'updated_at'=>now()]);
            $leadId=DB::table('quotes as q')->join('service_requests as sr','sr.id','=','q.service_request_id')->where('q.id',$booking->quote_id)->value('sr.lead_id');
            if($leadId) app(\App\Services\LeadService::class)->sync($leadId);
            if($target==='completed') {
                DB::table('review_requests')->insertOrIgnore(['booking_id'=>$id,'status'=>'queued','created_at'=>now(),'updated_at'=>now()]);
                \App\Jobs\SendPostServiceReviewEmail::dispatch($id)->afterCommit()->delay(now()->addHours(max(0,config('services.reviews.delay_hours',24))));
            }
            return ['booking_id'=>$booking->public_id,'status'=>$target];
        });
        return response()->json($result);
    }
}
