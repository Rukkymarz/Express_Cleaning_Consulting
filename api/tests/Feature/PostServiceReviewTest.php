<?php
namespace Tests\Feature;

use App\Jobs\SendPostServiceReviewEmail;
use App\Services\ReviewMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PostServiceReviewTest extends TestCase
{
    use RefreshDatabase;

    private function booking(bool $consent): int
    {
        $now=now();
        $service=DB::table('service_types')->insertGetId(['code'=>'TEST','slug'=>'test-clean','name'=>'Test','category'=>'Residential','created_at'=>$now,'updated_at'=>$now]);
        $address=DB::table('addresses')->insertGetId(['street'=>'12 Test Street','city'=>'Atlanta','region'=>'GA','postal_code'=>'30301','country'=>'US','created_at'=>$now,'updated_at'=>$now]);
        $lead=DB::table('leads')->insertGetId(['public_id'=>(string)Str::ulid(),'name'=>'Test Customer','email'=>'customer@example.test','status'=>'new','created_at'=>$now,'updated_at'=>$now]);
        DB::table('consents')->insert(['lead_id'=>$lead,'channel'=>'review_email','granted'=>$consent,'source'=>'test','policy_version'=>'test','recorded_at'=>$now,'created_at'=>$now,'updated_at'=>$now]);
        $request=DB::table('service_requests')->insertGetId(['public_id'=>(string)Str::ulid(),'lead_id'=>$lead,'address_id'=>$address,'service_type_id'=>$service,'status'=>'received','property_type'=>'residential','frequency'=>'one_time','time_zone'=>'America/New_York','created_at'=>$now,'updated_at'=>$now]);
        $quote=DB::table('quotes')->insertGetId(['public_id'=>(string)Str::ulid(),'service_request_id'=>$request,'status'=>'accepted','revision'=>1,'subtotal_cents'=>10000,'tax_cents'=>0,'total_cents'=>10000,'expires_at'=>$now->addDay(),'created_at'=>$now,'updated_at'=>$now]);
        $booking=DB::table('bookings')->insertGetId(['public_id'=>(string)Str::ulid(),'quote_id'=>$quote,'status'=>'completed','start_at'=>$now,'end_at'=>$now->addHours(2),'time_zone'=>'America/New_York','completed_at'=>$now,'created_at'=>$now,'updated_at'=>$now]);
        DB::table('review_requests')->insert(['booking_id'=>$booking,'status'=>'queued','created_at'=>$now,'updated_at'=>$now]);
        return $booking;
    }

    public function test_opted_in_completion_sends_once_via_mailer(): void
    {
        config()->set('services.reviews',['url'=>'https://example.test/review','resend_key'=>'test-key','from'=>'support@example.test']);
        $booking=$this->booking(true);
        $mailer=\Mockery::mock(ReviewMailer::class);
        $mailer->shouldReceive('send')->once()->with('test-key','support@example.test','customer@example.test','Test Customer','https://example.test/review',$booking)->andReturn('email_test_1');
        $this->app->instance(ReviewMailer::class,$mailer);
        SendPostServiceReviewEmail::dispatchSync($booking);
        SendPostServiceReviewEmail::dispatchSync($booking);
        $this->assertDatabaseHas('review_requests',['booking_id'=>$booking,'status'=>'sent','provider_message_id'=>'email_test_1']);
    }

    public function test_no_consent_suppresses_delivery(): void
    {
        config()->set('services.reviews',['url'=>'https://example.test/review','resend_key'=>'test-key','from'=>'support@example.test']);
        $booking=$this->booking(false);
        $mailer=\Mockery::mock(ReviewMailer::class);$mailer->shouldNotReceive('send');$this->app->instance(ReviewMailer::class,$mailer);
        SendPostServiceReviewEmail::dispatchSync($booking);
        $this->assertDatabaseHas('review_requests',['booking_id'=>$booking,'status'=>'suppressed']);
    }
}
