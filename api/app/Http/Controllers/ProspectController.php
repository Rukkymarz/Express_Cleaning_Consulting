<?php
namespace App\Http\Controllers;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Carbon\CarbonImmutable;
class ProspectController extends Controller
{
    public function index(Request $request) {
        $data=$request->validate(['segment'=>'nullable|in:residential,commercial','queue'=>'nullable|in:all,new,due','before'=>'required_if:queue,due|nullable|date','region'=>'nullable|in:GA,MI','search'=>'nullable|string|max:100']);
        $q=DB::table('sales_prospects');
        if(!empty($data['segment'])) $q->where('segment',$data['segment']);
        if(($data['queue']??'all')==='new') $q->where('status','new');
        if(($data['queue']??'all')==='due') $q->whereNotIn('status',['not_interested','do_not_contact','converted'])->whereNotNull('next_follow_up_at')->where('next_follow_up_at','<=',CarbonImmutable::parse($data['before'])->utc());
        if(!empty($data['search'])) { $term=addcslashes(trim($data['search']),'%_\\'); $q->where(fn($q)=>$q->where('name','like',"%$term%")->orWhere('email','like',"%$term%")->orWhere('phone','like',"%$term%")->orWhere('city','like',"%$term%")); }
        if(!empty($data['region']))$q->where('region',$data['region']);
        return response()->json($q->select('sales_prospects.*',DB::raw("CASE WHEN region='GA' THEN 0 WHEN region='MI' THEN 1 ELSE 2 END AS territory_priority"))->orderBy('territory_priority')->orderByDesc('id')->cursorPaginate(25));
    }
    public function store(Request $request) {
        $data=$request->validate(['name'=>'required|string|max:255','segment'=>'required|in:residential,commercial','email'=>'nullable|required_without:phone|email|max:255','phone'=>'nullable|required_without:email|string|max:32','city'=>'nullable|string|max:255','region'=>'nullable|string|size:2|regex:/^[A-Za-z]{2}$/','source'=>'required|string|max:500','service_interest'=>'required|in:Cleaning,Deep cleaning,Office cleaning,Move-in/out cleaning,Junk removal,Pressure washing,Other','notes'=>'nullable|string|max:5000']);
        if(!empty($data['email'])) $data['email']=strtolower(trim($data['email']));
        if(!empty($data['phone'])) { $digits=preg_replace('/\D/','',$data['phone']); if(strlen($digits)===10)$digits='1'.$digits; abort_unless(preg_match('/^1[2-9]\d{2}[2-9]\d{6}$/',$digits),422,'Enter a valid US phone number.'); $data['phone']='+'.$digits; }
        if(!empty($data['region']))$data['region']=strtoupper($data['region']);
        $result=DB::transaction(function()use($data,$request){
            $duplicate=DB::table('sales_prospects')->where(function($q)use($data){ if(!empty($data['email']))$q->where('email',$data['email']); if(!empty($data['phone']))$q->orWhere('phone',$data['phone']); })->first();
            abort_if($duplicate,422,'This contact is already in Lead generation. Search for the existing record.');
            $id=DB::table('sales_prospects')->insertGetId([...$data,'assigned_agent_id'=>$request->user()->id,'created_at'=>now(),'updated_at'=>now()]);
            $this->audit($request,$id,'created',['segment'=>$data['segment']]);
            return DB::table('sales_prospects')->find($id);
        });
        return response()->json($result,201);
    }
    public function update(Request $request,int $id) {
        $data=$request->validate(['status'=>'sometimes|in:new,contacted,follow_up,interested,not_interested,do_not_contact','notes'=>'sometimes|nullable|string|max:5000','next_follow_up_at'=>'sometimes|nullable|date','assigned_agent_id'=>'sometimes|required|integer|exists:users,id']);
        abort_if(!$data,422,'Nothing to update');
        if(isset($data['assigned_agent_id']))abort_unless(User::permission('leads.edit')->find($data['assigned_agent_id']),422,'Assign to an approved sales agent');
        if(!empty($data['next_follow_up_at']))$data['next_follow_up_at']=CarbonImmutable::parse($data['next_follow_up_at'])->utc();
        return DB::transaction(function()use($request,$id,$data){
            $old=DB::table('sales_prospects')->where('id',$id)->lockForUpdate()->first();abort_unless($old,404);
            abort_if($old->status==='converted',422,'This prospect has moved to the lead pipeline. Update it there.');
            if(($data['status']??$old->status)==='do_not_contact')$data['next_follow_up_at']=null;
            DB::table('sales_prospects')->where('id',$id)->update([...$data,'updated_at'=>now()]);
            $this->audit($request,$id,'updated',$data);
            return response()->json(DB::table('sales_prospects')->find($id));
        });
    }
    public function convert(Request $request,int $id) {
        return DB::transaction(function()use($request,$id){
            $p=DB::table('sales_prospects')->where('id',$id)->lockForUpdate()->first();abort_unless($p,404);
            if($p->lead_id)return response()->json(['lead_id'=>$p->lead_id]);
            abort_unless($p->status==='interested',422,'Mark the prospect interested before moving it to the pipeline.');
            $lead=DB::table('leads')->where(function($q)use($p){if($p->email)$q->where('email',$p->email);if($p->phone)$q->orWhere('phone',$p->phone);})->first();
            $leadId=$lead?->id??DB::table('leads')->insertGetId(['public_id'=>(string)Str::ulid(),'name'=>$p->name,'email'=>$p->email,'phone'=>$p->phone,'source'=>'staff_prospect','status'=>'qualified','pipeline_stage'=>'new_lead','lead_score'=>($p->email?10:0)+($p->phone?10:0),'assigned_agent_id'=>$p->assigned_agent_id,'next_follow_up_at'=>$p->next_follow_up_at,'created_at'=>now(),'updated_at'=>now()]);
            DB::table('sales_prospects')->where('id',$id)->update(['lead_id'=>$leadId,'status'=>'converted','next_follow_up_at'=>null,'updated_at'=>now()]);
            $this->audit($request,$id,'converted',['lead_id'=>$leadId]);return response()->json(['lead_id'=>$leadId]);
        });
    }
    private function audit(Request $request,int $id,string $action,array $changes): void {
        DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'sales_prospect','entity_id'=>$id,'action'=>$action,'changes'=>json_encode($changes),'created_at'=>now(),'updated_at'=>now()]);
    }
}
