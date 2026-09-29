<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Carbon\CarbonImmutable;

class QuoteController extends Controller
{
    public function issue(Request $request, int $serviceRequestId)
    {
        $v=$request->validate([
            'items'=>'required|array|min:1|max:30','items.*.description'=>'required|string|max:255',
            'items.*.quantity'=>'required|integer|min:1|max:9999','items.*.unit_cents'=>'required|integer|min:0|max:100000000',
            'tax_cents'=>'required|integer|min:0|max:100000000','deposit_cents'=>'required|integer|min:0|max:100000000',
            'expires_at'=>'required|date|after:now',
        ]);
        $quote=DB::transaction(function () use ($v,$serviceRequestId,$request) {
            $sr=DB::table('service_requests')->where('id',$serviceRequestId)->lockForUpdate()->first(); abort_unless($sr,404);
            abort_if(DB::table('quotes')->where('service_request_id',$sr->id)->where('status','accepted')->exists(),409,'Accepted quote already exists');
            $subtotal=array_reduce($v['items'], fn($sum,$item)=>$sum+$item['quantity']*$item['unit_cents'], 0);
            $total=$subtotal+$v['tax_cents']; abort_if($v['deposit_cents']>$total || $total<50,422,'Invalid quote amount');
            $revision=(int) DB::table('quotes')->where('service_request_id',$sr->id)->max('revision')+1;
            $publicId=(string)Str::ulid(); $now=now();
            $id=DB::table('quotes')->insertGetId(['public_id'=>$publicId,'service_request_id'=>$sr->id,'approved_by'=>$request->user()->id,'revision'=>$revision,'status'=>'sent','currency'=>'USD','subtotal_cents'=>$subtotal,'tax_cents'=>$v['tax_cents'],'total_cents'=>$total,'deposit_cents'=>$v['deposit_cents'],'expires_at'=>$v['expires_at'],'created_at'=>$now,'updated_at'=>$now]);
            foreach($v['items'] as $item) DB::table('quote_items')->insert(['quote_id'=>$id,'description'=>$item['description'],'quantity'=>$item['quantity'],'unit_cents'=>$item['unit_cents'],'total_cents'=>$item['quantity']*$item['unit_cents']]);
            DB::table('service_requests')->where('id',$sr->id)->update(['status'=>'quoted','updated_at'=>$now]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'quote','entity_id'=>$id,'action'=>'issued','changes'=>json_encode(['total_cents'=>$total,'revision'=>$revision]),'created_at'=>$now,'updated_at'=>$now]);
            app(\App\Services\LeadService::class)->sync($sr->lead_id);
            return ['quote_id'=>$publicId,'revision'=>$revision,'total_cents'=>$total,'deposit_cents'=>$v['deposit_cents'],'status'=>'sent'];
        });
        return response()->json($quote,201);
    }

    public function accept(Request $request, string $quoteId)
    {
        $result=DB::transaction(function () use ($request,$quoteId) {
            $quote=DB::table('quotes')->where('public_id',$quoteId)->lockForUpdate()->first(); abort_unless($quote,404);
            $lead=DB::table('service_requests as sr')->join('leads as l','l.id','=','sr.lead_id')->where('sr.id',$quote->service_request_id)->first(['l.customer_id']);
            abort_unless($lead?->customer_id===$request->user()->id,404);
            abort_if($quote->status!=='sent' || now()->greaterThan($quote->expires_at),409,'Quote unavailable');
            DB::table('quotes')->where('id',$quote->id)->update(['status'=>'accepted','accepted_at'=>now(),'updated_at'=>now()]);
            DB::table('service_requests')->where('id',$quote->service_request_id)->update(['status'=>'accepted','updated_at'=>now()]);
            $leadId=DB::table('service_requests')->where('id',$quote->service_request_id)->value('lead_id');
            app(\App\Services\LeadService::class)->sync($leadId);
            return ['status'=>'accepted','next_step'=>'availability_confirmation'];
        });
        return response()->json($result);
    }

    public function prepareBooking(Request $request, string $quoteId)
    {
        $v=$request->validate(['worker_id'=>'required|integer|exists:workers,id','start_at'=>'required|date','end_at'=>'required|date','time_zone'=>'required|timezone']);
        $start=CarbonImmutable::parse($v['start_at'],$v['time_zone'])->utc(); $end=CarbonImmutable::parse($v['end_at'],$v['time_zone'])->utc();
        abort_if($start->isPast() || !$end->greaterThan($start),422,'Invalid booking window');
        $v['start_at']=$start->toDateTimeString(); $v['end_at']=$end->toDateTimeString();
        $receipt=DB::transaction(function () use ($quoteId,$v,$request) {
            $quote=DB::table('quotes')->where('public_id',$quoteId)->lockForUpdate()->first(); abort_unless($quote,404); abort_unless($quote->status==='accepted',409);
            $worker=DB::table('workers')->where('id',$v['worker_id'])->lockForUpdate()->first(); abort_unless($worker && $worker->approval_status==='approved',409,'Worker is not approved');
            $conflict=DB::table('booking_assignments as ba')->join('bookings as b','b.id','=','ba.booking_id')->where('ba.worker_id',$worker->id)->whereIn('b.status',['ready_for_payment','scheduled','in_progress'])->where('b.start_at','<',$v['end_at'])->where('b.end_at','>',$v['start_at'])->exists();
            abort_if($conflict,409,'Worker is already assigned in this time window');
            $customerId=DB::table('service_requests as sr')->join('leads as l','l.id','=','sr.lead_id')->where('sr.id',$quote->service_request_id)->value('l.customer_id');
            abort_unless($customerId,409,'Customer account must be verified and linked');
            $existing=DB::table('bookings')->where('quote_id',$quote->id)->first(); abort_if($existing,409,'Booking already exists');
            $now=now(); $publicId=(string)Str::ulid();
            $id=DB::table('bookings')->insertGetId(['public_id'=>$publicId,'quote_id'=>$quote->id,'customer_id'=>$customerId,'status'=>'ready_for_payment','start_at'=>$v['start_at'],'end_at'=>$v['end_at'],'time_zone'=>$v['time_zone'],'created_at'=>$now,'updated_at'=>$now]);
            $invoiceId=(string)Str::ulid();
            DB::table('invoices')->insert(['public_id'=>$invoiceId,'number'=>'ECC-'.$invoiceId,'booking_id'=>$id,'currency'=>$quote->currency,'subtotal_cents'=>$quote->subtotal_cents,'tax_cents'=>$quote->tax_cents,'total_cents'=>$quote->total_cents,'issued_at'=>$now,'due_at'=>$v['start_at'],'created_at'=>$now,'updated_at'=>$now]);
            DB::table('booking_assignments')->insert(['booking_id'=>$id,'worker_id'=>$worker->id,'status'=>'accepted','created_at'=>$now,'updated_at'=>$now]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'booking','entity_id'=>$id,'action'=>'prepared','changes'=>json_encode(['worker_id'=>$worker->id]),'created_at'=>$now,'updated_at'=>$now]);
            $leadId=DB::table('service_requests')->where('id',$quote->service_request_id)->value('lead_id');
            app(\App\Services\LeadService::class)->sync($leadId);
            return ['booking_id'=>$publicId,'status'=>'ready_for_payment'];
        });
        return response()->json($receipt,201);
    }
}
