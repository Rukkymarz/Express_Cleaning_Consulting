<?php
namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $this->createService();

        $first = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-test-1'));
        $first->assertStatus(202)->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)->assertJsonStructure(['request_id','status','next_step']);
        $requestId = $first->json('request_id');

        $serviceRequest = DB::table('service_requests')->where('public_id', $requestId)->first();
        $this->assertNotNull($serviceRequest);
        $this->assertDatabaseHas('addresses', ['id' => $serviceRequest->address_id, 'region' => 'GA']);
        $this->assertDatabaseHas('leads', ['id' => $serviceRequest->lead_id, 'email' => 'quote-flow@example.test']);
        $this->assertSame(4, DB::table('consents')->where('lead_id', $serviceRequest->lead_id)->count());

        $replay = $this->postJson('/api/v1/requests', $this->payload(), $this->headers('public-request-test-1'));
        $replay->assertStatus(202)->assertJsonPath('request_id', $requestId);
        $this->assertSame(1, DB::table('service_requests')->count());
        $this->assertSame(1, DB::table('leads')->count());
        $this->assertSame(1, DB::table('addresses')->count());
    }

    public function test_public_request_rejects_unknown_state_code(): void
    {
        $this->createService();

        $this->postJson('/api/v1/requests', $this->payload('ZZ'), $this->headers('public-request-test-invalid-state'))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['address.region']);
        $this->assertSame(0, DB::table('service_requests')->count());
    }
}
