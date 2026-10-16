<?php
namespace App\Http\Controllers;
use App\Services\LaunchMail;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
class PublicIntakeController extends Controller {
 public function store(Request $request,LaunchMail $mail){
  $data=$request->validate([
   'kind'=>'required|in:discount,partner,referral,vendor','website'=>'nullable|string|max:255|size:0',
   'email'=>'required|email:rfc|max:255','name'=>'required_unless:kind,discount|nullable|string|max:150',
   'company'=>'nullable|string|max:255','phone'=>'required_if:kind,partner,vendor|nullable|string|max:32',
   'city'=>'required_unless:kind,discount|nullable|string|max:100','region'=>'required_if:kind,partner,vendor|nullable|string|max:100',
   'postal_code'=>'required_if:kind,referral,vendor|nullable|regex:/^\d{5}$/',
   'zip_codes'=>'required_if:kind,partner|nullable|string|max:500|regex:/^\d{5}(\s*,\s*\d{5})*$/',
   'team_size'=>'required_if:kind,partner|nullable|integer|min:1|max:1000','services'=>'required_if:kind,partner|nullable|string|max:2000',
   'own_supplies'=>'required_if:kind,partner|nullable|in:yes,no','client_name'=>'required_if:kind,referral|nullable|string|max:150',
   'client_phone'=>'nullable|string|max:32','client_email'=>'nullable|email:rfc|max:255','service'=>'required_if:kind,referral|nullable|string|max:255',
   'notes'=>'nullable|string|max:3000','marketing_email'=>'required|boolean','permission'=>'required|boolean',
  ]);
  abort_if($data['kind']==='referral'&&(!($data['permission']??false)||empty($data['client_phone'])&&empty($data['client_email'])),422,'Client permission and a client phone number or email are required.');
  $key=$request->header('Idempotency-Key');abort_unless(is_string($key)&&strlen($key)>0&&strlen($key)<=120,422,'Idempotency-Key required');
  $data['email']=strtolower(trim($data['email']));unset($data['website']);ksort($data);$hash=hash('sha256',json_encode($data,JSON_THROW_ON_ERROR));
  $result=DB::transaction(function()use($data,$key,$hash,$mail){
   $now=now();$publicId=(string)Str::ulid();
   $created=DB::table('public_intakes')->insertOrIgnore(['public_id'=>$publicId,'kind'=>$data['kind'],'request_key'=>$key,'payload_hash'=>$hash,'name'=>$data['name']??null,'email'=>$data['email'],'details'=>json_encode($data,JSON_THROW_ON_ERROR),'marketing_email'=>$data['marketing_email'],'created_at'=>$now,'updated_at'=>$now]);
   $record=DB::table('public_intakes')->where('request_key',$key)->lockForUpdate()->first();abort_unless($record,500);abort_unless(hash_equals($record->payload_hash,$hash),409,'This request key was already used for different details. Refresh before sending a new request.');
   if(!$created)return $record;
   if($data['kind']==='discount'){$mail->queue('discount-'.$record->public_id,$data['email'],'Your first-clean offer: 10% off, up to $30',"Thanks for requesting your first-clean offer.\n\nCode: FIRSTCLEAN10\nSave 10% on your first completed cleaning, up to $30. New customers only. One offer per customer/property; cannot be combined. Excludes hauling/disposal fees, taxes, tips and add-ons. Local availability must be confirmed. Mention the code before approving your quote; our team confirms the discount in writing.\n\nRequest a free quote: https://www.expresscleaningconsult.com/book?offer=FIRSTCLEAN10\nNo card is required and no payment is taken by the quote form.\n\nThis is the offer email you requested. For questions or email preferences, reply to support@expresscleaningconsult.com.");}
   $lines=[];foreach($data as $k=>$v){$lines[]=str_replace('_',' ',$k).': '.(is_bool($v)?($v?'yes':'no'):$v);}
   $mail->queue('intake-staff-'.$record->public_id,config('services.quote_notifications.to'),'New '.$data['kind'].' inquiry '.$record->public_id,"A new website inquiry is ready for review.\nReference: ".$record->public_id."\n\n".implode("\n",$lines)."\n\nReview: https://www.expresscleaningconsult.com/admin/inquiries\nStatus: open");
   DB::table('audit_events')->insert(['entity_type'=>'public_intake','entity_id'=>$record->id,'action'=>'received','created_at'=>$now,'updated_at'=>$now]);
   return $record;
  });
  return response()->json(['receipt'=>$result->public_id,'status'=>'received','offer_code'=>$data['kind']==='discount'?'FIRSTCLEAN10':null],202);
 }
 public function index(Request $request){$filter=$request->validate(['kind'=>'nullable|in:discount,partner,referral,vendor']);return response()->json(DB::table('public_intakes')->when(!empty($filter['kind']),fn($q)=>$q->where('kind',$filter['kind']))->orderByDesc('id')->paginate(30));}
 public function update(Request $request,string $id){$data=$request->validate(['status'=>'required|in:open,in_progress,completed']);DB::transaction(function()use($id,$data,$request){$row=DB::table('public_intakes')->where('public_id',$id)->lockForUpdate()->first();abort_unless($row,404);DB::table('public_intakes')->where('id',$row->id)->update([...$data,'updated_at'=>now()]);DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'public_intake','entity_id'=>$row->id,'action'=>'status.updated','changes'=>json_encode(['from'=>$row->status,'to'=>$data['status']]),'created_at'=>now(),'updated_at'=>now()]);});return response()->noContent();}
}
