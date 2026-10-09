<?php
namespace Tests\Feature;
use Tests\TestCase;
class CallingDisabledTest extends TestCase {
 public function test_calling_provider_routes_are_removed(): void {
  $this->getJson('/api/v1/call-center/token')->assertNotFound();
  $this->getJson('/api/v1/agent/voice-token')->assertNotFound();
  $this->postJson('/api/v1/webhooks/twilio/voice')->assertNotFound();
  $this->postJson('/api/v1/webhooks/twilio/incoming')->assertNotFound();
 }
}
