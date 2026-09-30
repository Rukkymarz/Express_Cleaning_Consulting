<?php
namespace App\Http\Controllers;

use App\Services\StripeInvoiceService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;
use Stripe\Webhook;

class PaymentController extends Controller
{
    private function assertPaymentMode(bool $testOnly = false): void
    {
        $mode = (string) config('services.stripe.payments_mode', 'disabled');
        $secret = (string) config('services.stripe.secret', '');
        abort_unless(in_array($mode, ['test', 'live'], true) && $secret !== '', 503, 'Payments are disabled');

        $isTestKey = str_starts_with($secret, 'sk_test_') || str_starts_with($secret, 'rk_test_');
        $isLiveKey = str_starts_with($secret, 'sk_live_') || str_starts_with($secret, 'rk_live_');
        if ($testOnly) {
            abort_unless($mode === 'test' && $isTestKey, 503, 'Test-mode Stripe invoicing is not configured');
            return;
        }

        if ($mode === 'test') abort_unless($isTestKey, 503, 'Stripe test mode requires a test key');
        if ($mode === 'live') abort_unless($isLiveKey && config('services.stripe.live_enabled'), 503, 'Live payments require explicit activation');
    }

    public function intent(Request $request)
    {
        $v=$request->validate(['booking_id'=>'required|string|size:26','mode'=>'required|in:deposit,full,balance']);
        $key=$request->header('Idempotency-Key'); abort_unless($key && strlen($key)<=120,422,'Idempotency-Key required');
        $this->assertPaymentMode();
        $environment=(string)config('services.stripe.payments_mode');
        $booking=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->where('b.public_id',$v['booking_id'])->where('b.customer_id',$request->user()->id)->first(['b.id','b.status','q.total_cents','q.deposit_cents','q.currency']);
        abort_unless($booking,404);
        if ($v['mode']==='balance') abort_unless($booking->status==='completed',409,'Balance is available after service completion');
        else abort_unless($booking->status==='ready_for_payment',409,'Booking is not ready for payment');
        $settled=(int)DB::table('payments')->where('booking_id',$booking->id)->where('environment',$environment)
            ->where('idempotency_key','!=',$key)->whereIn('status',['succeeded','partially_refunded'])
            ->selectRaw('COALESCE(SUM(amount_cents - refunded_cents),0) as settled')->value('settled');
        $active=DB::table('payments')->where('booking_id',$booking->id)->where('environment',$environment)->where('idempotency_key','!=',$key)
            ->whereIn('status',['creating','requires_payment_method','requires_confirmation','requires_action','processing','invoice_open','failed','needs_reconciliation'])->exists();
        abort_if($active,409,'Another payment option is already in progress');
        if ($v['mode']==='balance') {
            $amount=max(0,$booking->total_cents-$settled);
        }
        else {
            abort_if($settled>0,409,'Payment already received for this booking');
            $amount=$v['mode']==='deposit' ? $booking->deposit_cents : $booking->total_cents;
        }
        abort_if($amount<50,422,'No approved amount for this payment mode');
        $stripe=new StripeClient(config('services.stripe.secret'));
        $payment=DB::table('payments')->where('idempotency_key',$key)->first();
        if ($payment) abort_unless($payment->booking_id===$booking->id && $payment->amount_cents===$amount && $payment->kind===$v['mode'] && $payment->environment===$environment,409,'Idempotency key reused for a different payment');
        else {
            DB::table('payments')->insertOrIgnore(['booking_id'=>$booking->id,'kind'=>$v['mode'],'environment'=>$environment,'status'=>'creating','currency'=>$booking->currency,'amount_cents'=>$amount,'idempotency_key'=>$key,'created_at'=>now(),'updated_at'=>now()]);
            $payment=DB::table('payments')->where('idempotency_key',$key)->first();
            abort_unless($payment->booking_id===$booking->id && $payment->amount_cents===$amount && $payment->kind===$v['mode'] && $payment->environment===$environment,409,'Idempotency key reused for a different payment');
        }
        // Stripe idempotency ensures retry after a network failure reuses the same intent.
        $intent=$payment->stripe_intent_id
            ? $stripe->paymentIntents->retrieve($payment->stripe_intent_id, [])
            : $stripe->paymentIntents->create(['amount'=>$amount,'currency'=>strtolower($booking->currency),'automatic_payment_methods'=>['enabled'=>true],'metadata'=>['payment_id'=>(string)$payment->id,'booking_id'=>(string)$booking->id]], ['idempotency_key'=>'ecc-payment-'.$payment->id]);
        // The synchronous Stripe response may attach an external ID, but only a
        // verified webhook is allowed to advance or fail payment state.
        DB::table('payments')->where('id',$payment->id)->where('status','creating')->update([
            'stripe_intent_id'=>$intent->id,
            'updated_at'=>now(),
        ]);
        return response()->json(['payment_id'=>$payment->id,'client_secret'=>$intent->client_secret,'amount_cents'=>$amount,'currency'=>$booking->currency]);
    }

    public function testInvoice(Request $request, string $bookingId, StripeInvoiceService $invoices)
    {
        $this->assertPaymentMode(testOnly: true);
        $v = $request->validate([
            'mode' => 'required|in:deposit,full,balance',
            'days_until_due' => 'required|integer|min:1|max:90',
        ]);
        $key = $request->header('Idempotency-Key');
        abort_unless($key && strlen($key) <= 120, 422, 'Idempotency-Key required');

        $prepared = DB::transaction(function () use ($bookingId, $v, $key) {
            $booking = DB::table('bookings as b')
                ->join('quotes as q', 'q.id', '=', 'b.quote_id')
                ->join('service_requests as sr', 'sr.id', '=', 'q.service_request_id')
                ->join('leads as l', 'l.id', '=', 'sr.lead_id')
                ->join('service_types as service', 'service.id', '=', 'sr.service_type_id')
                ->where('b.public_id', $bookingId)
                ->lockForUpdate()
                ->first([
                    'b.id', 'b.public_id as booking_public_id', 'b.status',
                    'q.public_id as quote_public_id', 'q.status as quote_status',
                    'q.total_cents', 'q.deposit_cents', 'q.currency',
                    'sr.public_id as request_receipt', 'l.name', 'l.email', 'service.name as service_name',
                ]);
            abort_unless($booking, 404);
            abort_unless($booking->quote_status === 'accepted', 409, 'The quote must be accepted before invoicing');
            if ($v['mode'] === 'balance') abort_unless($booking->status === 'completed', 409, 'Balance is available after service completion');
            else abort_unless($booking->status === 'ready_for_payment', 409, 'Booking is not ready for invoicing');

            $settled = (int) DB::table('payments')->where('booking_id', $booking->id)->where('environment', 'test')
                ->where('idempotency_key', '!=', $key)
                ->whereIn('status', ['succeeded', 'partially_refunded'])
                ->selectRaw('COALESCE(SUM(amount_cents - refunded_cents),0) as settled')->value('settled');
            if ($v['mode'] === 'balance') {
                $amount = max(0, $booking->total_cents - $settled);
            } else {
                abort_if($settled > 0, 409, 'Payment already received for this booking');
                $amount = $v['mode'] === 'deposit' ? $booking->deposit_cents : $booking->total_cents;
            }
            abort_if($amount < 50, 422, 'No approved amount for this invoice mode');

            $payment = DB::table('payments')->where('idempotency_key', $key)->first();
            if ($payment) {
                abort_unless($payment->booking_id === $booking->id && $payment->amount_cents === $amount && $payment->kind === $v['mode'] && $payment->environment === 'test', 409, 'Idempotency key reused for a different payment');
                abort_if($payment->stripe_intent_id, 409, 'This idempotency key already belongs to a card payment');
                abort_if($payment->status === 'needs_reconciliation', 409, 'The prior Stripe result is ambiguous and must be reconciled before retrying');
            } else {
                $active = DB::table('payments')->where('booking_id', $booking->id)
                    ->where('environment', 'test')
                    ->where('idempotency_key', '!=', $key)
                    ->whereIn('status', ['creating', 'requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'invoice_open', 'failed', 'needs_reconciliation'])
                    ->exists();
                abort_if($active, 409, 'Another test payment option is already in progress');
                DB::table('payments')->insert([
                    'booking_id' => $booking->id,
                    'kind' => $v['mode'],
                    'environment' => 'test',
                    'status' => 'creating',
                    'currency' => $booking->currency,
                    'amount_cents' => $amount,
                    'idempotency_key' => $key,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $payment = DB::table('payments')->where('idempotency_key', $key)->first();
            }

            return [
                'payment_id' => $payment->id,
                'payment_status' => $payment->status,
                'stripe_invoice_id' => $payment->stripe_invoice_id,
                'hosted_invoice_url' => $payment->hosted_invoice_url,
                'amount_cents' => $amount,
                'currency' => $booking->currency,
                'email' => $booking->email,
                'name' => $booking->name,
                'description' => $booking->service_name.' — approved '.$v['mode'],
                'days_until_due' => $v['days_until_due'],
                'metadata' => [
                    'payment_id' => (string) $payment->id,
                    'booking_id' => $booking->booking_public_id,
                    'quote_id' => $booking->quote_public_id,
                    'request_receipt' => $booking->request_receipt,
                    'payment_mode' => $v['mode'],
                ],
            ];
        });

        if ($prepared['stripe_invoice_id']) {
            return response()->json([
                'payment_id' => $prepared['payment_id'],
                'status' => $prepared['payment_status'],
                'amount_cents' => $prepared['amount_cents'],
                'currency' => $prepared['currency'],
                'hosted_invoice_url' => $prepared['hosted_invoice_url'],
                'test_mode' => true,
            ]);
        }

        try {
            $invoice = $invoices->createTestInvoice($prepared);
            DB::table('payments')->where('id', $prepared['payment_id'])->update([
                'stripe_customer_id' => $invoice['customer_id'],
                'stripe_invoice_id' => $invoice['invoice_id'],
                'hosted_invoice_url' => $invoice['hosted_invoice_url'],
                'invoice_pdf_url' => $invoice['invoice_pdf_url'],
                'updated_at' => now(),
            ]);
            DB::table('payments')->where('id', $prepared['payment_id'])->where('status', 'creating')->update([
                'status' => 'invoice_open',
                'failure_code' => null,
                'failure_message' => null,
                'updated_at' => now(),
            ]);
        } catch (\Throwable $error) {
            DB::table('payments')->where('id', $prepared['payment_id'])->where('status', 'creating')->update([
                'status' => 'needs_reconciliation',
                'failure_code' => 'stripe_invoice_result_unknown',
                'failure_message' => 'Stripe did not return a confirmed invoice result. Reconcile before retrying.',
                'failed_at' => now(),
                'updated_at' => now(),
            ]);
            report($error);
            $stored = DB::table('payments')->where('id', $prepared['payment_id'])->first(['status', 'hosted_invoice_url']);
            if ($stored && $stored->status !== 'needs_reconciliation') {
                return response()->json([
                    'payment_id' => $prepared['payment_id'],
                    'status' => $stored->status,
                    'amount_cents' => $prepared['amount_cents'],
                    'currency' => $prepared['currency'],
                    'hosted_invoice_url' => $stored->hosted_invoice_url,
                    'test_mode' => true,
                ]);
            }
            abort(502, 'Stripe did not confirm the test invoice result. Reconcile it before retrying.');
        }

        $stored = DB::table('payments')->where('id', $prepared['payment_id'])->first(['status', 'hosted_invoice_url']);
        return response()->json([
            'payment_id' => $prepared['payment_id'],
            'status' => $stored->status,
            'amount_cents' => $prepared['amount_cents'],
            'currency' => $prepared['currency'],
            'hosted_invoice_url' => $stored->hosted_invoice_url,
            'test_mode' => true,
        ], 201);
    }

    public function webhook(Request $request)
    {
        $secret=config('services.stripe.webhook_secret'); abort_unless($secret,503);
        try { $event=Webhook::constructEvent($request->getContent(),$request->header('Stripe-Signature',''),$secret); }
        catch (\Throwable $e) { return response()->json(['error'=>'Invalid signature or payload'],400); }
        DB::transaction(function () use ($event) {
            $now=now();
            $environment=($event->livemode ?? false) ? 'live' : 'test';
            $inserted=DB::table('provider_events')->insertOrIgnore(['provider'=>'stripe','event_id'=>$event->id,'event_type'=>$event->type,'created_at'=>$now,'updated_at'=>$now]);
            if (!$inserted) return;
            $intent=$event->data->object; $id=$intent->id ?? null;
            if (in_array($event->type,['payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled'],true) && $id) {
                $payment=DB::table('payments')->where('environment',$environment)->where('stripe_intent_id',$id)->lockForUpdate()->first();
                if (!$payment && isset($intent->metadata->payment_id)) {
                    $payment=DB::table('payments')->where('environment',$environment)->where('id',(int)$intent->metadata->payment_id)->lockForUpdate()->first();
                }
                if ($payment) {
                    $intentMatches = !$payment->stripe_intent_id || hash_equals((string) $payment->stripe_intent_id, (string) $id);
                    $reportedAmount = $event->type === 'payment_intent.succeeded'
                        ? (isset($intent->amount_received) ? (int) $intent->amount_received : (isset($intent->amount) ? (int) $intent->amount : null))
                        : (isset($intent->amount) ? (int) $intent->amount : null);
                    $reportedCurrency = isset($intent->currency) ? strtoupper((string) $intent->currency) : null;
                    if (!$intentMatches || $reportedAmount !== (int) $payment->amount_cents || $reportedCurrency !== strtoupper($payment->currency)) {
                        Log::warning('Stripe PaymentIntent event did not match the stored intent, amount, or currency.', [
                            'event_id' => $event->id,
                            'intent_id' => $id,
                            'payment_id' => $payment->id,
                        ]);
                        DB::table('provider_events')->where('provider','stripe')->where('event_id',$event->id)->update([
                            'event_type' => $event->type.'.mismatch', 'processed_at' => $now, 'updated_at' => $now,
                        ]);
                        return;
                    }
                    if (!$payment->stripe_intent_id) {
                        DB::table('payments')->where('id',$payment->id)->update(['stripe_intent_id'=>$id]);
                    }
                    if ($event->type==='payment_intent.succeeded') {
                        $advanced = DB::table('payments')->where('id',$payment->id)
                            ->whereNotIn('status',['succeeded','partially_refunded','refunded'])
                            ->update(['status'=>'succeeded','updated_at'=>$now]);
                        if ($environment === 'live' && $advanced > 0) {
                            DB::table('bookings')->where('id',$payment->booking_id)->where('status','ready_for_payment')->update(['status'=>'scheduled','updated_at'=>$now]);
                            $leadId=DB::table('bookings as b')->join('quotes as q','q.id','=','b.quote_id')->join('service_requests as sr','sr.id','=','q.service_request_id')->where('b.id',$payment->booking_id)->value('sr.lead_id');
                            if ($leadId) app(\App\Services\LeadService::class)->sync($leadId);
                        }
                    } elseif (!in_array($payment->status, ['succeeded','partially_refunded','refunded'], true)) {
                        DB::table('payments')->where('id',$payment->id)->update(['status'=>$event->type==='payment_intent.canceled'?'canceled':'failed','updated_at'=>$now]);
                    }
                }
            }
            if ($event->type==='charge.refunded' && isset($intent->payment_intent)) {
                $payment=DB::table('payments')->where('environment',$environment)->where('stripe_intent_id',$intent->payment_intent)->lockForUpdate()->first();
                if($payment) {
                    $refunded=min($payment->amount_cents,(int)$intent->amount_refunded);
                    DB::table('payments')->where('id',$payment->id)->update(['refunded_cents'=>$refunded,'status'=>$refunded >= $payment->amount_cents?'refunded':'partially_refunded','updated_at'=>$now]);
                }
            }
            if (in_array($event->type, ['invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible'], true) && $id) {
                $payment = DB::table('payments')->where('environment',$environment)->where('stripe_invoice_id', $id)->lockForUpdate()->first();
                if (!$payment && isset($intent->metadata->payment_id)) {
                    $payment = DB::table('payments')->where('environment',$environment)->where('id', (int) $intent->metadata->payment_id)->lockForUpdate()->first();
                }
                if ($payment) {
                    $invoiceMatches = !$payment->stripe_invoice_id || hash_equals((string) $payment->stripe_invoice_id, (string) $id);
                    $reportedAmount = isset($intent->total) ? (int) $intent->total : (isset($intent->amount_due) ? (int) $intent->amount_due : null);
                    $reportedCurrency = isset($intent->currency) ? strtoupper((string) $intent->currency) : null;
                    if (!$invoiceMatches || $reportedAmount !== (int) $payment->amount_cents || $reportedCurrency !== strtoupper($payment->currency)) {
                        Log::warning('Stripe invoice event did not match the stored invoice, amount, or currency.', [
                            'event_id' => $event->id,
                            'invoice_id' => $id,
                            'payment_id' => $payment->id,
                        ]);
                        DB::table('provider_events')->where('provider','stripe')->where('event_id',$event->id)->update([
                            'event_type' => $event->type.'.mismatch', 'processed_at' => $now, 'updated_at' => $now,
                        ]);
                        return;
                    }
                    if (!$payment->stripe_invoice_id) {
                        DB::table('payments')->where('id', $payment->id)->update(['stripe_invoice_id' => $id]);
                    }
                    if ($event->type === 'invoice.paid') {
                        DB::table('payments')->where('id', $payment->id)->whereNotIn('status', ['succeeded', 'partially_refunded', 'refunded'])->update([
                            'status' => 'succeeded', 'paid_at' => $now, 'failed_at' => null,
                            'failure_code' => null, 'failure_message' => null, 'updated_at' => $now,
                        ]);
                    } elseif (!in_array($payment->status, ['succeeded', 'partially_refunded', 'refunded'], true)) {
                        $status = match ($event->type) {
                            'invoice.payment_failed' => 'failed',
                            'invoice.voided' => 'canceled',
                            default => 'uncollectible',
                        };
                        DB::table('payments')->where('id', $payment->id)->update([
                            'status' => $status,
                            'failed_at' => $event->type === 'invoice.payment_failed' ? $now : $payment->failed_at,
                            'failure_code' => $event->type,
                            'failure_message' => $event->type === 'invoice.payment_failed' ? 'Stripe reported that the invoice payment failed.' : null,
                            'updated_at' => $now,
                        ]);
                    }
                }
            }
            DB::table('provider_events')->where('provider','stripe')->where('event_id',$event->id)->update(['processed_at'=>$now,'updated_at'=>$now]);
        });
        return response()->json(['received'=>true]);
    }
}
