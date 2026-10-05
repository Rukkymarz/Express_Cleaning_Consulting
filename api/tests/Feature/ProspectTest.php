<?php
namespace Tests\Feature;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;
class ProspectTest extends TestCase {
 use RefreshDatabase;
 private function agent(): User { $u=User::create(['name'=>'Test agent','email'=>'agent@example.test','password'=>bcrypt('test-password-only')]);foreach(['leads.view','leads.edit'] as $p)Permission::findOrCreate($p,'web');$u->givePermissionTo(['leads.view','leads.edit']);return $u; }
 private function payload(): array { return ['name'=>'Test business','segment'=>'commercial','email'=>'prospect@example.test','phone'=>'2025550149','source'=>'Synthetic test','service_interest'=>'Office cleaning']; }
 public function test_private_routes_require_login_and_permissions(): void { $this->getJson('/api/v1/admin/prospects')->assertUnauthorized();$u=User::create(['name'=>'Customer','email'=>'customer@example.test','password'=>bcrypt('test-password-only')]);Permission::findOrCreate('leads.view','web');Permission::findOrCreate('leads.edit','web');$this->actingAs($u)->getJson('/api/v1/admin/prospects')->assertForbidden();$this->postJson('/api/v1/admin/prospects',$this->payload())->assertForbidden(); }
 public function test_create_dedupe_follow_up_and_conversion(): void {
  $u=$this->agent();$this->actingAs($u);
  $id=$this->postJson('/api/v1/admin/prospects',$this->payload())->assertCreated()->json('id');
  $this->assertDatabaseHas('sales_prospects',['id'=>$id,'phone'=>'+12025550149','assigned_agent_id'=>$u->id,'status'=>'new']);
  $this->postJson('/api/v1/admin/prospects',$this->payload())->assertUnprocessable();
  $this->getJson('/api/v1/admin/prospects?segment=residential')->assertOk()->assertJsonCount(0,'data');
  $this->getJson('/api/v1/admin/prospects?segment=commercial&queue=new')->assertOk()->assertJsonCount(1,'data');
  $this->patchJson("/api/v1/admin/prospects/$id",['status'=>'follow_up','notes'=>'Requested callback','next_follow_up_at'=>'2026-10-05T14:00:00Z'])->assertOk();
  $this->getJson('/api/v1/admin/prospects?queue=due&before=2026-10-05T23:59:59Z')->assertOk()->assertJsonCount(1,'data');
  $this->postJson("/api/v1/admin/prospects/$id/convert")->assertUnprocessable();
  $this->patchJson("/api/v1/admin/prospects/$id",['status'=>'interested'])->assertOk();
  $lead=$this->postJson("/api/v1/admin/prospects/$id/convert")->assertOk()->json('lead_id');
  $this->postJson("/api/v1/admin/prospects/$id/convert")->assertOk()->assertJson(['lead_id'=>$lead]);
  $this->assertDatabaseCount('leads',1);$this->assertDatabaseCount('consents',0);$this->assertDatabaseCount('service_requests',0);
  $this->assertDatabaseHas('leads',['id'=>$lead,'pipeline_stage'=>'new_lead','source'=>'staff_prospect']);
 }
 public function test_do_not_contact_excluded_from_daily_queue(): void { $this->actingAs($this->agent());$id=$this->postJson('/api/v1/admin/prospects',$this->payload())->assertCreated()->json('id');$this->patchJson("/api/v1/admin/prospects/$id",['status'=>'do_not_contact','next_follow_up_at'=>'2026-10-05T14:00:00Z'])->assertOk();$this->assertDatabaseHas('sales_prospects',['id'=>$id,'next_follow_up_at'=>null]);$this->getJson('/api/v1/admin/prospects?queue=due&before=2026-10-05T23:59:59Z')->assertOk()->assertJsonCount(0,'data');$this->postJson("/api/v1/admin/prospects/$id/convert")->assertUnprocessable(); }
 public function test_contact_and_source_required(): void { $this->actingAs($this->agent());$data=$this->payload();unset($data['email'],$data['phone'],$data['source']);$this->postJson('/api/v1/admin/prospects',$data)->assertUnprocessable()->assertJsonValidationErrors(['email','phone','source']); }
 public function test_georgia_precedes_michigan_and_other_regions(): void {
  $this->actingAs($this->agent());foreach(['CA','MI','GA'] as $region){$data=$this->payload();$data['email']=strtolower($region).'@example.test';unset($data['phone']);$data['region']=$region;$this->postJson('/api/v1/admin/prospects',$data)->assertCreated();}
  $this->getJson('/api/v1/admin/prospects')->assertOk()->assertJsonPath('data.0.region','GA')->assertJsonPath('data.1.region','MI')->assertJsonPath('data.2.region','CA');
 }
 public function test_daily_reminder_is_once_and_no_customer_outreach(): void {
  \Carbon\CarbonImmutable::setTestNow(\Carbon\CarbonImmutable::parse('2026-10-05T14:00:00Z'));
  try {
   $u=$this->agent();$u->email='christinewealth789@gmail.com';$u->save();$this->actingAs($u);$this->postJson('/api/v1/admin/prospects',$this->payload())->assertCreated();
   config()->set('services.quote_notifications',['resend_key'=>'test-only','from'=>'support@example.test']);
   \Illuminate\Support\Facades\Http::fake(['api.resend.com/emails'=>\Illuminate\Support\Facades\Http::response(['id'=>'test-reminder'],200)]);
   $service=app(\App\Services\ProspectReminderService::class);
   $this->assertSame(1,$service->run(true)['eligible']);\Illuminate\Support\Facades\Http::assertNothingSent();
   $this->assertSame(1,$service->run()['accepted']);$this->assertSame(0,$service->run()['accepted']);
   \Illuminate\Support\Facades\Http::assertSentCount(1);
   \Illuminate\Support\Facades\Http::assertSent(fn($r)=>$r['to']===['christinewealth789@gmail.com']&&$r->hasHeader('Idempotency-Key'));
   $this->assertDatabaseHas('prospect_reminders',['user_id'=>$u->id,'status'=>'sent']);
  } finally {\Carbon\CarbonImmutable::setTestNow();}
 }
}
