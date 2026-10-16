<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
class LaunchIntakeTest extends TestCase {
 use RefreshDatabase;
 private function discount():array{return ['kind'=>'discount','email'=>'synthetic@example.test','marketing_email'=>false,'permission'=>false,'website'=>''];}
 public function test_saved_offer_is_idempotent_and_does_not_create_a_booking():void {
  Bus::fake();$headers=['Idempotency-Key'=>'synthetic-offer-1'];$body=$this->discount();
  $receipt=$this->postJson('/api/v1/public-intakes',$body,$headers)->assertStatus(202)->assertJsonPath('offer_code','FIRSTCLEAN10')->json('receipt');
  $this->postJson('/api/v1/public-intakes',$body,$headers)->assertStatus(202)->assertJsonPath('receipt',$receipt);
  $this->assertDatabaseCount('public_intakes',1);$this->assertDatabaseCount('launch_mail_outbox',2);$this->assertDatabaseCount('service_requests',0);
  $this->assertDatabaseHas('public_intakes',['public_id'=>$receipt,'status'=>'open','marketing_email'=>false]);
  $body['email']='different@example.test';$this->postJson('/api/v1/public-intakes',$body,$headers)->assertStatus(409);
 }
 public function test_referral_requires_permission_and_a_client_contact():void {
  $body=['kind'=>'referral','name'=>'Synthetic Referrer','email'=>'synthetic@example.test','client_name'=>'Synthetic Client','city'=>'Atlanta','postal_code'=>'30301','service'=>'Deep clean','marketing_email'=>false,'permission'=>false];
  $this->postJson('/api/v1/public-intakes',$body,['Idempotency-Key'=>'referral-1'])->assertStatus(422);
  $body['permission']=true;$this->postJson('/api/v1/public-intakes',$body,['Idempotency-Key'=>'referral-1'])->assertStatus(422);
  Bus::fake();$body['client_email']='client@example.test';$this->postJson('/api/v1/public-intakes',$body,['Idempotency-Key'=>'referral-1'])->assertStatus(202);
  $this->assertDatabaseCount('public_intakes',1);$this->assertDatabaseCount('launch_mail_outbox',1);
 }
 public function test_partner_fields_and_honeypot_are_enforced():void {
  $body=$this->discount();$body['kind']='partner';$this->postJson('/api/v1/public-intakes',$body,['Idempotency-Key'=>'partner-1'])->assertStatus(422)->assertJsonValidationErrors(['name','city','zip_codes','team_size','services','own_supplies']);
  $body=$this->discount();$body['website']='https://spam.example';$this->postJson('/api/v1/public-intakes',$body,['Idempotency-Key'=>'bot-1'])->assertStatus(422);
  $this->assertDatabaseCount('public_intakes',0);
 }
 public function test_inbox_is_private_and_mail_missing_configuration_is_visible():void {
  $this->getJson('/api/v1/admin/inquiries')->assertUnauthorized();
  $id=DB::table('launch_mail_outbox')->insertGetId(['message_key'=>'test-blocked','recipient'=>'synthetic@example.test','subject'=>'Synthetic test','body'=>'Test only','status'=>'queued','created_at'=>now(),'updated_at'=>now()]);
  config()->set('services.quote_notifications.resend_key',null);
  (new \App\Jobs\SendLaunchMail($id))->handle();$this->assertDatabaseHas('launch_mail_outbox',['id'=>$id,'status'=>'blocked','failure_reason'=>'mail_configuration_missing']);
 }
 public function test_expired_mail_retry_is_held_instead_of_sent_again():void {
  $id=DB::table('launch_mail_outbox')->insertGetId(['message_key'=>'expired-1','recipient'=>'synthetic@example.test','subject'=>'Synthetic test','body'=>'Test only','status'=>'retrying','attempts'=>1,'first_attempt_at'=>now()->subHours(24),'created_at'=>now()->subHours(24),'updated_at'=>now()]);
  (new \App\Jobs\SendLaunchMail($id))->handle();$this->assertDatabaseHas('launch_mail_outbox',['id'=>$id,'status'=>'needs_reconciliation','failure_reason'=>'idempotency_window_expired']);
 }
}
