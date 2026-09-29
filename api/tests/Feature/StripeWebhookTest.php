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
        $payment=DB::table('payments')->insertGetId(['booking_id'=>$booking,'kind'=>'deposit','status'=>'processing','currency'=>'USD','amount_cents'=>3000,'stripe_intent_id'=>'pi_test_signed_webhook','idempotency_key'=>'test-booking-1','created_at'=>$now,'updated_at'=>$now]);
        return [$lead,$booking,$payment];
    }

    private function signedEvent(string $eventId, string $secret): array
    {
        $body=json_encode(['id'=>$eventId,'object'=>'event','type'=>'payment_intent.succeeded','data'=>['object'=>['id'=>'pi_test_signed_webhook','object'=>'payment_intent','metadata'=>[]]]],JSON_THROW_ON_ERROR);
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
}
