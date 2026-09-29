<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Stripe\StripeClient;
use Stripe\Webhook;

class PaymentController extends Controller
{
    public function intent(Request $request)
    {
        $v=$request->validate(['booking_id'=>'required|string|size:26','mode'=>'required|in:deposit,full,balance']);
        $key=$request->header('Idempotency-Key'); abort_unless($key && strlen($key)<=120,422,'Idempotency-Key required');
        abort_unless(config('services.stripe.secret'),503,'Payments are not configured');
        $booking=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->where('b.public_id',$v['booking_id'])->where('b.customer_id',$request->user()->id)->first(['b.id','b.status','q.total_cents','q.deposit_cents','q.currency']);
        abort_unless($booking,404);
        if ($v['mode']==='balance') abort_unless($booking->status==='completed',409,'Balance is available after service completion');
        else abort_unless($booking->status==='ready_for_payment',409,'Booking is not ready for payment');
        $settled=(int)DB::table('payments')->where('booking_id',$booking->id)->whereIn('status',['succeeded','partially_refunded'])->selectRaw('COALESCE(SUM(amount_cents - refunded_cents),0) as settled')->value('settled');
        if ($v['mode']==='balance') {
            $active=DB::table('payments')->where('booking_id',$booking->id)->where('kind','balance')->whereIn('status',['creating','requires_payment_method','requires_confirmation','requires_action','processing'])->where('idempotency_key','!=',$key)->exists();
            abort_if($active,409,'A balance payment is already in progress');
            $amount=max(0,$booking->total_cents-$settled);
        }
        else {
            abort_if($settled>0,409,'Payment already received for this booking');
            $other=DB::table('payments')->where('booking_id',$booking->id)->where('kind','!=',$v['mode'])->whereIn('status',['creating','requires_payment_method','requires_confirmation','requires_action','processing'])->exists();
            abort_if($other,409,'Another payment option is already in progress');
            $amount=$v['mode']==='deposit' ? $booking->deposit_cents : $booking->total_cents;
        }
        abort_if($amount<50,422,'No approved amount for this payment mode');
        $stripe=new StripeClient(config('services.stripe.secret'));
        $payment=DB::table('payments')->where('idempotency_key',$key)->first();
        if ($payment) abort_unless($payment->booking_id===$booking->id && $payment->amount_cents===$amount && $payment->kind===$v['mode'],409,'Idempotency key reused for a different payment');
        else {
            DB::table('payments')->insertOrIgnore(['booking_id'=>$booking->id,'kind'=>$v['mode'],'status'=>'creating','currency'=>$booking->currency,'amount_cents'=>$amount,'idempotency_key'=>$key,'created_at'=>now(),'updated_at'=>now()]);
            $payment=DB::table('payments')->where('idempotency_key',$key)->first();
            abort_unless($payment->booking_id===$booking->id && $payment->amount_cents===$amount && $payment->kind===$v['mode'],409,'Idempotency key reused for a different payment');
        }
        // Stripe idempotency ensures retry after a network failure reuses the same intent.
        $intent=$payment->stripe_intent_id
            ? $stripe->paymentIntents->retrieve($payment->stripe_intent_id, [])
            : $stripe->paymentIntents->create(['amount'=>$amount,'currency'=>strtolower($booking->currency),'automatic_payment_methods'=>['enabled'=>true],'metadata'=>['payment_id'=>(string)$payment->id,'booking_id'=>(string)$booking->id]], ['idempotency_key'=>'ecc-payment-'.$payment->id]);
        DB::table('payments')->where('id',$payment->id)->update(['stripe_intent_id'=>$intent->id,'status'=>$intent->status,'updated_at'=>now()]);
        return response()->json(['payment_id'=>$payment->id,'client_secret'=>$intent->client_secret,'amount_cents'=>$amount,'currency'=>$booking->currency]);
    }

    public function webhook(Request $request)
    {
        $secret=config('services.stripe.webhook_secret'); abort_unless($secret,503);
        try { $event=Webhook::constructEvent($request->getContent(),$request->header('Stripe-Signature',''),$secret); }
        catch (\Throwable $e) { return response()->json(['error'=>'Invalid signature or payload'],400); }
        DB::transaction(function () use ($event) {
            $now=now();
            $inserted=DB::table('provider_events')->insertOrIgnore(['provider'=>'stripe','event_id'=>$event->id,'event_type'=>$event->type,'created_at'=>$now,'updated_at'=>$now]);
            if (!$inserted) return;
            $intent=$event->data->object; $id=$intent->id ?? null;
            if (in_array($event->type,['payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled'],true) && $id) {
                $payment=DB::table('payments')->where('stripe_intent_id',$id)->lockForUpdate()->first();
                if (!$payment && isset($intent->metadata->payment_id)) {
                    $payment=DB::table('payments')->where('id',(int)$intent->metadata->payment_id)->lockForUpdate()->first();
                    if ($payment && !$payment->stripe_intent_id) DB::table('payments')->where('id',$payment->id)->update(['stripe_intent_id'=>$id]);
                }
                if ($payment) {
                    if ($event->type==='payment_intent.succeeded') {
                        DB::table('payments')->where('id',$payment->id)->whereNotIn('status',['succeeded','refunded'])->update(['status'=>'succeeded','updated_at'=>$now]);
                        DB::table('bookings')->where('id',$payment->booking_id)->where('status','ready_for_payment')->update(['status'=>'scheduled','updated_at'=>$now]);
                        $leadId=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->join('service_requests as sr','sr.id','=','q.service_request_id')->where('b.id',$payment->booking_id)->value('sr.lead_id');
                        if ($leadId) app(\App\Services\LeadService::class)->sync($leadId);
                    } elseif ($payment->status!=='succeeded' && $payment->status!=='refunded') {
                        DB::table('payments')->where('id',$payment->id)->update(['status'=>$event->type==='payment_intent.canceled'?'canceled':'failed','updated_at'=>$now]);
                    }
                }
            }
            if ($event->type==='charge.refunded' && isset($intent->payment_intent)) {
                $payment=DB::table('payments')->where('stripe_intent_id',$intent->payment_intent)->lockForUpdate()->first();
                if($payment) {
                    $refunded=min($payment->amount_cents,(int)$intent->amount_refunded);
                    DB::table('payments')->where('id',$payment->id)->update(['refunded_cents'=>$refunded,'status'=>$refunded >= $payment->amount_cents?'refunded':'partially_refunded','updated_at'=>$now]);
                }
            }
            DB::table('provider_events')->where('provider','stripe')->where('event_id',$event->id)->update(['processed_at'=>$now,'updated_at'=>$now]);
        });
        return response()->json(['received'=>true]);
    }
}
