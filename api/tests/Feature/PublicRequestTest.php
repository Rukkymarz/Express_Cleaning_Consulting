<?php
namespace Tests\Feature;

use App\Jobs\SendQuoteRequestNotification;
use App\Services\QuoteNotificationDispatcher;
use App\Services\QuoteRequestMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Bus;
use Mockery;
use Tests\TestCase;

class PublicRequestTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://www.expresscleaningconsult.com';

    private function createService(): void
    {
        DB::table('service_types')->insert([
            'code' => 'RES-STD',
            'slug' => 'standard-home-cleaning',
            'name' => 'Standard Residential Cleaning',
            'category' => 'Residential',
            'request_enabled' => true,
            'published' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function payload(string $region = 'GA'): array
    {
        return [
            'service_code' => 'RES-STD',
            'address' => ['street' => '100 Test Avenue', 'unit' => null, 'city' => 'Atlanta', 'region' => $region, 'postal_code' => '30301', 'country' => 'US'],
            'property' => ['type' => 'residential', 'square_feet' => 1200, 'bedrooms' => 2, 'bathrooms' => 1, 'condition' => 'moderate', 'pets_on_site' => false, 'supplies_available' => 'unsure'],
            'preferred_start' => null,
            'time_zone' => 'America/New_York',
            'frequency' => 'one_time',
            'add_on_codes' => [],
            'notes' => 'Automated public quote request test.',
            'access_notes' => null,
            'contact' => ['name' => 'Quote Flow Test', 'email' => 'quote-flow@example.test', 'phone' => '4045550100'],
            'consent' => ['transactional_sms' => false, 'marketing_email' => false, 'marketing_sms' => false, 'review_email' => false],
        ];
    }

    private function headers(string $key): array
    {
        return ['Origin' => self::ORIGIN, 'Sec-Fetch-Site' => 'cross-site', 'Idempotency-Key' => $key];
    }

    public function test_public_request_is_saved_without_csrf_and_replay_is_idempotent(): void
    {
        config()->set('cors.allowed_origins', [self::ORIGIN]);
        config()->set('sanctum.stateful', ['www.expresscleaningconsult.com']);
        config()->set('services.quote_notifications.resend_key', null);
        Bus::fake();
        $this->createService();

        $first = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-test-1'));
        $first->assertStatus(202)->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)
            ->assertJsonStructure(['request_id','status','next_step','workflow'=>['task_status','notification_status']])
            ->assertJsonPath('workflow.task_status','open')
            ->assertJsonPath('workflow.notification_status','queued');
        $requestId = $first->json('request_id');

        $serviceRequest = DB::table('service_requests')->where('public_id', $requestId)->first();
        $this->assertNotNull($serviceRequest);
        $this->assertDatabaseHas('addresses', ['id' => $serviceRequest->address_id, 'region' => 'GA']);
        $this->assertDatabaseHas('leads', ['id' => $serviceRequest->lead_id, 'email' => 'quote-flow@example.test']);
        $this->assertSame(4, DB::table('consents')->where('lead_id', $serviceRequest->lead_id)->count());
        $this->assertDatabaseHas('staff_tasks', ['service_request_id' => $serviceRequest->id, 'kind' => 'quote_review', 'status' => 'open']);
        $this->assertDatabaseHas('quote_request_notifications', ['service_request_id' => $serviceRequest->id, 'status' => 'queued']);
        Bus::assertDispatched(SendQuoteRequestNotification::class, fn ($job) => $job->connection === 'database' && $job->queue === 'quote-notifications');
        $this->getJson('/api/v1/requests/'.$requestId.'/status')
            ->assertOk()->assertJsonPath('task_status','open')->assertJsonPath('notification_status','queued');

        $replay = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-test-1'));
        $replay->assertStatus(202)->assertJsonPath('request_id', $requestId);
        $this->assertSame(1, DB::table('service_requests')->count());
        $this->assertSame(1, DB::table('leads')->count());
        $this->assertSame(1, DB::table('addresses')->count());
        $this->assertSame(1, DB::table('staff_tasks')->count());
        $this->assertSame(1, DB::table('quote_request_notifications')->count());
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 1);
    }

    public function test_short_callback_saves_phone_zip_task_and_notice_without_inventing_scope(): void
    {
        Bus::fake();
        $this->createService();
        $payload = [
            'request_kind' => 'callback', 'service_code' => 'RES-STD',
            'address' => ['region' => 'GA', 'postal_code' => '30301'],
            'contact' => ['name' => 'Callback Test', 'phone' => '(404) 555-0100'],
            'notes' => 'Please call about a move-out clean.',
        ];
        $headers = $this->headers('callback-request-test');
        $first = $this->postJson('/api/v1/requests', $payload, $headers);
        $first->assertStatus(202)->assertJsonPath('workflow.task_status', 'open');
        $sr = DB::table('service_requests')->where('public_id', $first->json('request_id'))->first();
        $this->assertDatabaseHas('leads', ['id' => $sr->lead_id, 'phone' => '(404) 555-0100', 'email' => null]);
        $this->assertDatabaseHas('addresses', ['id' => $sr->address_id, 'postal_code' => '30301', 'street' => null, 'city' => null, 'region' => 'GA']);
        $this->assertNull($sr->pets_on_site);
        $this->assertNull($sr->frequency);
        $this->assertNull($sr->time_zone);
        $this->assertNull($sr->preferred_start_at);
        $this->assertStringContainsString('Callback requested.', $sr->scope_notes);
        $this->assertSame(0, DB::table('consents')->where('lead_id', $sr->lead_id)->where('granted', true)->count());
        $this->assertDatabaseCount('launch_mail_outbox', 0);
        $notice = json_decode(DB::table('quote_request_notifications')->value('payload'), true);
        $this->assertStringContainsString('GA 30301', $notice['location']);
        $this->assertSame('(404) 555-0100', $notice['phone']);
        $this->assertSame('Not provided — call customer', $notice['email']);
        config()->set('services.quote_notifications', [
            'resend_key' => 'test-provider-key', 'from' => 'verified@example.test',
            'to' => 'expressconsulting92@gmail.com', 'review_url' => 'https://www.expresscleaningconsult.com/admin',
        ]);
        // The worker must still send the staff notice when the customer leaves email blank.
        DB::table('quote_request_notifications')->update(['payload' => json_encode([...$notice, 'review_url' => 'https://www.expresscleaningconsult.com/admin'])]);
        $mailer = Mockery::mock(QuoteRequestMailer::class);
        $mailer->shouldReceive('send')->once()->andReturn('callback-staff-notice');
        (new SendQuoteRequestNotification($sr->id))->handle($mailer);
        $this->assertDatabaseHas('quote_request_notifications', ['service_request_id' => $sr->id, 'status' => 'sent']);
        $this->postJson('/api/v1/requests', $payload, $headers)->assertStatus(202)->assertJsonPath('request_id', $first->json('request_id'));
        $this->assertDatabaseCount('leads', 1);
        $this->assertDatabaseCount('staff_tasks', 1);
        $this->assertDatabaseCount('quote_request_notifications', 1);
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 1);
    }

    public function test_callback_optional_email_queues_one_confirmation_and_invalid_contact_is_rejected(): void
    {
        Bus::fake();
        $this->createService();
        $payload = ['request_kind' => 'callback', 'service_code' => 'RES-STD',
            'address' => ['region' => 'GA', 'postal_code' => '30301'],
            'contact' => ['name' => 'Callback Test', 'phone' => '4045550100', 'email' => 'callback@example.test']];
        $this->postJson('/api/v1/requests', $payload, $this->headers('callback-email'))->assertStatus(202);
        $this->assertDatabaseHas('launch_mail_outbox', ['recipient' => 'callback@example.test']);
        $this->assertDatabaseCount('launch_mail_outbox', 1);
        $payload['contact']['phone'] = 'not a number';
        $payload['address']['region'] = 'XX';
        $payload['address']['postal_code'] = 'ZIP';
        $this->postJson('/api/v1/requests', $payload, $this->headers('callback-invalid'))
            ->assertStatus(422)->assertJsonValidationErrors(['contact.phone', 'address.region', 'address.postal_code']);
        $this->assertDatabaseCount('leads', 1);
    }

    public function test_public_request_rejects_unknown_state_code(): void
    {
        $this->createService();

        $this->postJson('/api/v1/requests', $this->payload('ZZ'), $this->headers('public-request-test-invalid-state'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['address.region']);
        $this->assertSame(0, DB::table('service_requests')->count());
    }

    public function test_queue_failure_does_not_hide_the_saved_receipt_and_replay_does_not_duplicate(): void
    {
        $this->createService();
        $dispatcher = Mockery::mock(QuoteNotificationDispatcher::class);
        $dispatcher->shouldReceive('dispatch')->once()->andThrow(new \RuntimeException('Simulated database queue outage'));
        $this->app->instance(QuoteNotificationDispatcher::class, $dispatcher);

        $first = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-queue-failure'));
        $first->assertStatus(202)->assertJsonPath('workflow.notification_status', 'queued');
        $receipt = $first->json('request_id');
        $this->assertDatabaseHas('service_requests', ['public_id' => $receipt]);
        $this->assertDatabaseHas('quote_request_notifications', ['status' => 'queued']);

        $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-queue-failure'))
            ->assertStatus(202)->assertJsonPath('request_id', $receipt);
        $this->assertSame(1, DB::table('service_requests')->count());
        $this->assertSame(1, DB::table('quote_request_notifications')->count());
    }

    public function test_recovery_command_claims_an_aged_queued_notification_once(): void
    {
        $this->createService();
        Bus::fake();

        $response = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-recovery'));
        $response->assertStatus(202);
        DB::table('quote_request_notifications')->update([
            'created_at' => now()->subMinutes(2),
            'updated_at' => now()->subMinutes(2),
        ]);

        $this->artisan('quote-notifications:recover')->assertSuccessful();
        $this->assertDatabaseHas('quote_request_notifications', ['status' => 'retrying']);
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 2);

        $this->artisan('quote-notifications:recover')->assertSuccessful();
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 2);
    }

    public function test_recovery_does_not_resend_after_provider_idempotency_window(): void
    {
        $this->createService();
        Bus::fake();

        $response = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-expired-recovery'));
        $response->assertStatus(202);
        DB::table('quote_request_notifications')->update([
            'status' => 'retrying',
            'attempts' => 1,
            'last_attempt_at' => now()->subHours(24),
            'updated_at' => now()->subHours(24),
        ]);

        $this->artisan('quote-notifications:recover')->assertSuccessful();
        $this->assertDatabaseHas('quote_request_notifications', [
            'status' => 'needs_reconciliation',
            'failure_reason' => 'provider_idempotency_window_expired',
        ]);
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 1);
    }

    public function test_delayed_retry_job_does_not_send_after_provider_idempotency_window(): void
    {
        $this->createService();
        Bus::fake();
        config()->set('services.quote_notifications', [
            'resend_key' => 'test-provider-key',
            'from' => 'verified@example.test',
            'to' => 'expressconsulting92@gmail.com',
            'review_url' => 'https://www.expresscleaningconsult.com/admin',
        ]);
        $mailer = Mockery::mock(QuoteRequestMailer::class);
        $mailer->shouldNotReceive('send');

        $response = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-expired-delayed-job'));
        $response->assertStatus(202);
        $serviceRequest = DB::table('service_requests')->where('public_id', $response->json('request_id'))->first();
        DB::table('quote_request_notifications')->where('service_request_id', $serviceRequest->id)->update([
            'status' => 'retrying',
            'attempts' => 1,
            'last_attempt_at' => now()->subHours(24),
            'updated_at' => now()->subHours(24),
        ]);

        (new SendQuoteRequestNotification($serviceRequest->id))->handle($mailer);

        $this->assertDatabaseHas('quote_request_notifications', [
            'service_request_id' => $serviceRequest->id,
            'status' => 'needs_reconciliation',
            'failure_reason' => 'provider_idempotency_window_expired',
        ]);
    }

    public function test_new_request_sends_one_retry_safe_staff_notification_and_replay_does_not_resend(): void
    {
        $this->createService();
        Bus::fake();
        config()->set('services.quote_notifications', [
            'resend_key' => 'test-provider-key',
            'from' => 'verified@example.test',
            'to' => 'expressconsulting92@gmail.com',
            'review_url' => 'https://www.expresscleaningconsult.com/admin',
        ]);
        $mailer = Mockery::mock(QuoteRequestMailer::class);
        $mailer->shouldReceive('send')->once()->withArgs(function ($key, $from, $to, $details) {
            return $key === 'test-provider-key'
                && $from === 'verified@example.test'
                && $to === 'expressconsulting92@gmail.com'
                && $details['customer_name'] === 'Quote Flow Test'
                && $details['email'] === 'quote-flow@example.test'
                && $details['phone'] === '4045550100'
                && $details['service'] === 'Standard Residential Cleaning'
                && str_contains($details['location'], 'Atlanta, GA 30301')
                && $details['task_status'] === 'open'
                && strlen($details['receipt']) === 26;
        })->andReturn('email_test_message_1');
        $this->app->instance(QuoteRequestMailer::class, $mailer);

        $first = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-email-test'));
        $first->assertStatus(202)->assertJsonPath('workflow.notification_status','queued');
        $serviceRequest = DB::table('service_requests')->where('public_id',$first->json('request_id'))->first();
        (new SendQuoteRequestNotification($serviceRequest->id))->handle($mailer);
        (new SendQuoteRequestNotification($serviceRequest->id))->handle($mailer);
        $this->assertDatabaseHas('quote_request_notifications', [
            'status' => 'sent', 'provider_message_id' => 'email_test_message_1',
        ]);

        $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-email-test'))
            ->assertStatus(202)->assertJsonPath('request_id', $first->json('request_id'));
        $this->assertSame(1, DB::table('staff_tasks')->count());
        $this->assertSame(1, DB::table('quote_request_notifications')->count());
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 1);
    }

    public function test_ambiguous_mail_result_is_logged_for_reconciliation_without_blind_resend(): void
    {
        $this->createService();
        Bus::fake();
        config()->set('services.quote_notifications', [
            'resend_key' => 'test-provider-key',
            'from' => 'verified@example.test',
            'to' => 'expressconsulting92@gmail.com',
            'review_url' => 'https://www.expresscleaningconsult.com/admin',
        ]);
        $mailer = Mockery::mock(QuoteRequestMailer::class);
        $mailer->shouldReceive('send')->once()->andThrow(new \RuntimeException('Simulated ambiguous provider result'));
        $this->app->instance(QuoteRequestMailer::class, $mailer);

        $first = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-email-ambiguous'));
        $first->assertStatus(202)->assertJsonPath('workflow.notification_status','queued');
        $serviceRequest = DB::table('service_requests')->where('public_id',$first->json('request_id'))->first();
        $job = new SendQuoteRequestNotification($serviceRequest->id);
        try {
            $job->handle($mailer);
            $this->fail('The simulated provider error should be retried.');
        } catch (\RuntimeException $error) {
            $job->failed($error);
        }
        $this->assertDatabaseHas('quote_request_notifications', [
            'status' => 'needs_reconciliation', 'failure_reason' => 'provider_result_unknown_after_retries',
        ]);

        $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-email-ambiguous'))
            ->assertStatus(202)->assertJsonPath('workflow.notification_status','needs_reconciliation');
        $this->assertSame(1, DB::table('quote_request_notifications')->count());
        Bus::assertDispatchedTimes(SendQuoteRequestNotification::class, 1);
    }
}
