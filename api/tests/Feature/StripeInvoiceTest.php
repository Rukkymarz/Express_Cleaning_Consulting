<?php

namespace Tests\Feature;

use App\Http\Controllers\PaymentController;
use App\Models\User;
use App\Services\StripeInvoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class StripeInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): string
    {
        $now = now();
        $customer = DB::table('users')->insertGetId(['name'=>'Invoice Test','email'=>'invoice@example.test','password'=>'unused','created_at'=>$now,'updated_at'=>$now]);
        $service = DB::table('service_types')->insertGetId(['code'=>'INV-TEST','slug'=>'invoice-test','name'=>'Invoice Test Cleaning','category'=>'Residential','created_at'=>$now,'updated_at'=>$now]);
        $address = DB::table('addresses')->insertGetId(['street'=>'9 Test Way','city'=>'Atlanta','region'=>'GA','postal_code'=>'30301','country'=>'US','created_at'=>$now,'updated_at'=>$now]);
        $lead = DB::table('leads')->insertGetId(['public_id'=>(string)Str::ulid(),'customer_id'=>$customer,'name'=>'Invoice Test','email'=>'invoice@example.test','phone'=>'4045550199','status'=>'new','created_at'=>$now,'updated_at'=>$now]);
        $serviceRequest = DB::table('service_requests')->insertGetId(['public_id'=>(string)Str::ulid(),'lead_id'=>$lead,'address_id'=>$address,'service_type_id'=>$service,'status'=>'accepted','property_type'=>'residential','frequency'=>'one_time','time_zone'=>'America/New_York','created_at'=>$now,'updated_at'=>$now]);
        $quote = DB::table('quotes')->insertGetId(['public_id'=>(string)Str::ulid(),'service_request_id'=>$serviceRequest,'status'=>'accepted','revision'=>1,'subtotal_cents'=>10000,'tax_cents'=>0,'total_cents'=>10000,'deposit_cents'=>3000,'expires_at'=>$now->addDay(),'accepted_at'=>$now,'created_at'=>$now,'updated_at'=>$now]);
        $bookingId = (string) Str::ulid();
        DB::table('bookings')->insert(['public_id'=>$bookingId,'quote_id'=>$quote,'customer_id'=>$customer,'status'=>'ready_for_payment','start_at'=>$now->addDays(3),'end_at'=>$now->addDays(3)->addHours(2),'time_zone'=>'America/New_York','created_at'=>$now,'updated_at'=>$now]);
        return $bookingId;
    }

    private function request(string $key): Request
    {
        $request = Request::create('/api/v1/admin/bookings/test/payment-invoices', 'POST', [
            'mode' => 'deposit', 'days_until_due' => 7,
        ]);
        $request->headers->set('Idempotency-Key', $key);
        return $request;
    }

    public function test_test_invoice_uses_quote_amount_and_idempotent_replay_reuses_it(): void
    {
        config()->set('services.stripe.secret', 'sk_test_fake_key_for_unit_test');
        config()->set('services.stripe.payments_mode', 'test');
        config()->set('services.stripe.live_enabled', false);
        $bookingId = $this->fixture();

        $gateway = Mockery::mock(StripeInvoiceService::class);
        $gateway->shouldReceive('createTestInvoice')->once()->withArgs(function ($details) use ($bookingId) {
            return $details['amount_cents'] === 3000
                && $details['currency'] === 'USD'
                && $details['metadata']['booking_id'] === $bookingId
                && $details['metadata']['payment_mode'] === 'deposit';
        })->andReturn([
            'customer_id' => 'cus_test_invoice',
            'invoice_id' => 'in_test_invoice',
            'hosted_invoice_url' => 'https://invoice.stripe.com/test/example',
            'invoice_pdf_url' => 'https://pay.stripe.com/test/example.pdf',
            'status' => 'open',
        ]);

        $controller = new PaymentController();
        $first = $controller->testInvoice($this->request('invoice-test-key'), $bookingId, $gateway);
        $this->assertSame(201, $first->getStatusCode());
        $this->assertDatabaseHas('payments', [
            'booking_id' => DB::table('bookings')->where('public_id',$bookingId)->value('id'),
            'kind' => 'deposit', 'environment' => 'test', 'amount_cents' => 3000, 'status' => 'invoice_open',
            'stripe_invoice_id' => 'in_test_invoice',
        ]);

        DB::table('payments')->where('idempotency_key', 'invoice-test-key')->update(['status' => 'succeeded']);
        $replay = $controller->testInvoice($this->request('invoice-test-key'), $bookingId, $gateway);
        $this->assertSame(200, $replay->getStatusCode());
        $this->assertSame('succeeded', $replay->getData(true)['status']);
        $this->assertSame(1, DB::table('payments')->count());
    }

    public function test_hosted_invoice_refuses_a_live_key(): void
    {
        config()->set('services.stripe.secret', 'sk_live_fake_key_for_unit_test');
        config()->set('services.stripe.payments_mode', 'live');
        config()->set('services.stripe.live_enabled', false);
        try {
            (new PaymentController())->testInvoice($this->request('live-key-must-fail'), '01ARZ3NDEKTSV4RRFFQ69G5FAV', Mockery::mock(StripeInvoiceService::class));
            $this->fail('A live key must not reach the test-invoice workflow.');
        } catch (HttpException $error) {
            $this->assertSame(503, $error->getStatusCode());
        }
    }

    public function test_failed_invoice_reuses_its_url_and_blocks_a_second_payable_invoice(): void
    {
        config()->set('services.stripe.secret', 'sk_test_fake_key_for_unit_test');
        config()->set('services.stripe.payments_mode', 'test');
        config()->set('services.stripe.live_enabled', false);
        $bookingId = $this->fixture();

        $gateway = Mockery::mock(StripeInvoiceService::class);
        $gateway->shouldReceive('createTestInvoice')->once()->andReturn([
            'customer_id' => 'cus_failed_invoice',
            'invoice_id' => 'in_failed_invoice',
            'hosted_invoice_url' => 'https://invoice.stripe.com/test/failed-example',
            'invoice_pdf_url' => 'https://pay.stripe.com/test/failed-example.pdf',
            'status' => 'open',
        ]);
        $controller = new PaymentController();
        $controller->testInvoice($this->request('failed-invoice-key'), $bookingId, $gateway);
        DB::table('payments')->where('idempotency_key', 'failed-invoice-key')->update(['status' => 'failed']);

        $replay = $controller->testInvoice($this->request('failed-invoice-key'), $bookingId, $gateway);
        $this->assertSame(200, $replay->getStatusCode());
        $this->assertSame('https://invoice.stripe.com/test/failed-example', $replay->getData(true)['hosted_invoice_url']);

        try {
            $controller->testInvoice($this->request('second-invoice-key'), $bookingId, $gateway);
            $this->fail('A failed-but-still-payable invoice must block a second invoice.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $this->assertSame(1, DB::table('payments')->count());
    }

    public function test_provider_return_does_not_regress_a_verified_webhook_status(): void
    {
        config()->set('services.stripe.secret', 'sk_test_fake_key_for_unit_test');
        config()->set('services.stripe.payments_mode', 'test');
        config()->set('services.stripe.live_enabled', false);
        $bookingId = $this->fixture();

        $gateway = Mockery::mock(StripeInvoiceService::class);
        $gateway->shouldReceive('createTestInvoice')->once()->andReturnUsing(function ($details) {
            DB::table('payments')->where('id', $details['payment_id'])->update([
                'stripe_invoice_id' => 'in_webhook_won_race',
                'status' => 'succeeded',
                'paid_at' => now(),
                'updated_at' => now(),
            ]);
            return [
                'customer_id' => 'cus_webhook_won_race',
                'invoice_id' => 'in_webhook_won_race',
                'hosted_invoice_url' => 'https://invoice.stripe.com/test/race',
                'invoice_pdf_url' => 'https://pay.stripe.com/test/race.pdf',
                'status' => 'open',
            ];
        });

        $response = (new PaymentController())->testInvoice($this->request('invoice-race-key'), $bookingId, $gateway);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('succeeded', $response->getData(true)['status']);
        $this->assertDatabaseHas('payments', [
            'idempotency_key' => 'invoice-race-key',
            'stripe_invoice_id' => 'in_webhook_won_race',
            'status' => 'succeeded',
        ]);
    }

    public function test_ambiguous_provider_failure_blocks_retry_without_a_second_payment_row(): void
    {
        config()->set('services.stripe.secret', 'sk_test_fake_key_for_unit_test');
        config()->set('services.stripe.payments_mode', 'test');
        config()->set('services.stripe.live_enabled', false);
        $bookingId = $this->fixture();
        $controller = new PaymentController();

        $failedGateway = Mockery::mock(StripeInvoiceService::class);
        $failedGateway->shouldReceive('createTestInvoice')->once()->andThrow(new \RuntimeException('Simulated provider timeout'));
        try {
            $controller->testInvoice($this->request('invoice-recovery-key'), $bookingId, $failedGateway);
            $this->fail('The simulated provider timeout should return a gateway error.');
        } catch (HttpException $error) {
            $this->assertSame(502, $error->getStatusCode());
        }
        $this->assertDatabaseHas('payments', ['idempotency_key'=>'invoice-recovery-key','environment'=>'test','status'=>'needs_reconciliation']);

        $unusedGateway = Mockery::mock(StripeInvoiceService::class);
        $unusedGateway->shouldNotReceive('createTestInvoice');
        try {
            $controller->testInvoice($this->request('invoice-recovery-key'), $bookingId, $unusedGateway);
            $this->fail('An ambiguous invoice result must be reconciled before retrying.');
        } catch (HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $this->assertSame(1, DB::table('payments')->count());
        $this->assertDatabaseHas('payments', ['idempotency_key'=>'invoice-recovery-key','status'=>'needs_reconciliation','stripe_invoice_id'=>null]);
    }

    public function test_hosted_invoice_route_requires_authentication_and_quote_permission(): void
    {
        $bookingId = $this->fixture();
        $payload = ['mode'=>'deposit','days_until_due'=>7];
        $headers = ['Idempotency-Key'=>'route-authorization-test'];

        $this->postJson('/api/v1/admin/bookings/'.$bookingId.'/payment-invoices', $payload, $headers)
            ->assertUnauthorized();
        $this->actingAs(User::query()->first());
        $this->postJson('/api/v1/admin/bookings/'.$bookingId.'/payment-invoices', $payload, $headers)
            ->assertForbidden();
    }
}
