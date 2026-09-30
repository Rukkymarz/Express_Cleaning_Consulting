<?php
namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class StripeWebhookTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $now=now();
        $user=DB::table('users')->insertGetId(['name'=>'Test Customer','email'=>'customer@example.test','password'=>'unused','created_at'=>$now,'updated_at'=>$now]);
        $service=DB::table('service_types')->insertGetId(['code'=>'TEST','slug'=>'test-clean','name'=>'Test Cleaning','category'=>'Residential','created_at'=>$now,'updated_at'=>$now]);
        $address=DB::table('addresses')->insertGetId(['street'=>'12 Test Street','city'=>'Atlanta','region'=>'GA','postal_code'=>'30301','country'=>'US','created_at'=>$now,'updated_at'=>$now]);
        $lead=DB::table('leads')->insertGetId(['public_id'=>(string)Str::ulid(),'customer_id'=>$user,'name'=>'Test Customer','email'=>'customer@example.test','status'=>'new','created_at'=>$now,'updated_at'=>$now]);
        $request=DB::table('service_requests')->insertGetId(['public_id'=>(string)Str::ulid(),'lead_id'=>$lead,'address_id'=>$address,'service_type_id'=>$service,'status'=>'received','property_type'=>'residential','frequency'=>'one_time','time_zone'=>'America/New_York','created_at'=>$now,'updated_at'=>$now]);
        $quote=DB::table('quotes')->insertGetId(['public_id'=>(string)Str::ulid(),'service_request_id'=>$request,'status'=>'accepted','revision'=>1,'subtotal_cents'=>10000,'tax_cents'=>0,'total_cents'=>10000,'deposit_cents'=>3000,'expires_at'=>$now->addDay(),'created_at'=>$now,'updated_at'=>$now]);
        $booking=DB::table('bookings')->insertGetId(['public_id'=>(string)Str::ulid(),'quote_id'=>$quote,'customer_id'=>$user,'status'=>'ready_for_payment','start_at'=>$now->addDays(3),'end_at'=>$now->addDays(3)->addHours(2),'time_zone'=>'America/New_York','created_at'=>$now,'updated_at'=>$now]);
        $payment=DB::table('payments')->insertGetId(['booking_id'=>$booking,'kind'=>'deposit','environment'=>'live','status'=>'processing','currency'=>'USD','amount_cents'=>3000,'stripe_intent_id'=>'pi_test_signed_webhook','idempotency_key'=>'test-booking-1','created_at'=>$now,'updated_at'=>$now]);
        return [$lead,$booking,$payment];
    }

    private function signedEvent(string $eventId, string $secret, int $amount = 3000, string $currency = 'usd'): array
    {
        $body=json_encode(['id'=>$eventId,'object'=>'event','livemode'=>true,'type'=>'payment_intent.succeeded','data'=>['object'=>['id'=>'pi_test_signed_webhook','object'=>'payment_intent','amount'=>$amount,'amount_received'=>$amount,'currency'=>$currency,'metadata'=>[]]]],JSON_THROW_ON_ERROR);
        $timestamp=time();
        return [$body,'t='.$timestamp.',v1='.hash_hmac('sha256',$timestamp.'.'.$body,$secret)];
    }

    private function signedInvoiceEvent(string $eventId, string $type, string $secret, int $paymentId, int $amountDue = 3000, string $currency = 'usd'): array
    {
        $body=json_encode(['id'=>$eventId,'object'=>'event','livemode'=>false,'type'=>$type,'data'=>['object'=>[
            'id'=>'in_test_hosted_invoice','object'=>'invoice','amount_due'=>$amountDue,'currency'=>$currency,
            'metadata'=>['payment_id'=>(string)$paymentId],
        ]]],JSON_THROW_ON_ERROR);
        $timestamp=time();
        return [$body,'t='.$timestamp.',v1='.hash_hmac('sha256',$timestamp.'.'.$body,$secret)];
    }

    private function signedRefundEvent(string $eventId, string $secret): array
    {
        $body=json_encode(['id'=>$eventId,'object'=>'event','livemode'=>true,'type'=>'charge.refunded','data'=>['object'=>[
            'id'=>'ch_test_refund','object'=>'charge','payment_intent'=>'pi_test_signed_webhook','amount_refunded'=>3000,
        ]]],JSON_THROW_ON_ERROR);
        $timestamp=time();
        return [$body,'t='.$timestamp.',v1='.hash_hmac('sha256',$timestamp.'.'.$body,$secret)];
    }

    public function test_signed_success_schedules_once_and_duplicate_event_is_idempotent(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [$lead,$booking,$payment]=$this->fixture();
        [$body,$signature]=$this->signedEvent('evt_signed_1','whsec_test_signing_secret');
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'succeeded']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'scheduled']);
        $this->assertDatabaseHas('leads',['id'=>$lead,'pipeline_stage'=>'booked']);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertSame(1,DB::table('provider_events')->where('provider','stripe')->where('event_id','evt_signed_1')->count());
    }

    public function test_invalid_signature_changes_nothing(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, $booking,$payment]=$this->fixture();
        [$body]=$this->signedEvent('evt_bad','wrong_secret');
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>'t='.time().',v1=invalid'],$body)->assertStatus(400);
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'processing']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);
        $this->assertSame(0,DB::table('provider_events')->count());
    }

    public function test_signed_payment_intent_with_wrong_amount_is_rejected(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, $booking,$payment]=$this->fixture();
        [$body,$signature]=$this->signedEvent('evt_intent_wrong_amount','whsec_test_signing_secret',9999);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'processing']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);
        $this->assertDatabaseHas('provider_events',['provider'=>'stripe','event_id'=>'evt_intent_wrong_amount','event_type'=>'payment_intent.succeeded.mismatch']);
    }

    public function test_refund_before_success_does_not_schedule_the_booking(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, $booking,$payment]=$this->fixture();
        [$refundBody,$refundSignature]=$this->signedRefundEvent('evt_refund_first','whsec_test_signing_secret');
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$refundSignature],$refundBody)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'refunded']);

        [$successBody,$successSignature]=$this->signedEvent('evt_success_after_refund','whsec_test_signing_secret');
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$successSignature],$successBody)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'refunded']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);
    }

    public function test_invoice_failure_then_payment_is_webhook_driven_and_duplicate_safe(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, $booking,$payment]=$this->fixture();
        DB::table('payments')->where('id',$payment)->update([
            'environment'=>'test','status'=>'invoice_open','stripe_intent_id'=>null,'stripe_invoice_id'=>'in_test_hosted_invoice',
        ]);

        [$failedBody,$failedSignature]=$this->signedInvoiceEvent('evt_invoice_failed','invoice.payment_failed','whsec_test_signing_secret',$payment);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$failedSignature],$failedBody)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'failed','failure_code'=>'invoice.payment_failed']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);

        [$paidBody,$paidSignature]=$this->signedInvoiceEvent('evt_invoice_paid','invoice.paid','whsec_test_signing_secret',$payment);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$paidSignature],$paidBody)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'succeeded','failure_code'=>null]);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);

        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$paidSignature],$paidBody)->assertOk();
        $this->assertSame(1,DB::table('provider_events')->where('provider','stripe')->where('event_id','evt_invoice_paid')->count());
    }

    public function test_out_of_order_invoice_failure_does_not_regress_a_paid_invoice(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, ,$payment]=$this->fixture();
        DB::table('payments')->where('id',$payment)->update([
            'environment'=>'test','status'=>'succeeded','stripe_intent_id'=>null,'stripe_invoice_id'=>'in_test_hosted_invoice','paid_at'=>now(),
        ]);
        [$body,$signature]=$this->signedInvoiceEvent('evt_invoice_late_failure','invoice.payment_failed','whsec_test_signing_secret',$payment);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'succeeded']);
    }

    public function test_signed_invoice_event_with_wrong_amount_is_rejected(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, ,$payment]=$this->fixture();
        DB::table('payments')->where('id',$payment)->update([
            'environment'=>'test','status'=>'invoice_open','stripe_intent_id'=>null,'stripe_invoice_id'=>'in_test_hosted_invoice',
        ]);
        [$body,$signature]=$this->signedInvoiceEvent('evt_invoice_wrong_amount','invoice.paid','whsec_test_signing_secret',$payment,9999);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'status'=>'invoice_open']);
        $this->assertDatabaseHas('provider_events',['provider'=>'stripe','event_id'=>'evt_invoice_wrong_amount','event_type'=>'invoice.paid.mismatch']);
    }

    public function test_test_event_cannot_update_a_live_payment(): void
    {
        config()->set('services.stripe.webhook_secret','whsec_test_signing_secret');
        [, $booking,$payment]=$this->fixture();
        $this->assertDatabaseHas('payments',['id'=>$payment,'environment'=>'live','status'=>'processing']);
        [$body,$signature]=$this->signedInvoiceEvent('evt_environment_mismatch','invoice.paid','whsec_test_signing_secret',$payment);
        $this->call('POST','/api/v1/webhooks/stripe',[],[],[],['CONTENT_TYPE'=>'application/json','HTTP_STRIPE_SIGNATURE'=>$signature],$body)->assertOk();
        $this->assertDatabaseHas('payments',['id'=>$payment,'environment'=>'live','status'=>'processing']);
        $this->assertDatabaseHas('bookings',['id'=>$booking,'status'=>'ready_for_payment']);
    }
}
