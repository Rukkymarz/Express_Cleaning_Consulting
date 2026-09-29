<?php
namespace App\Http\Controllers;

use App\Jobs\SendCampaignDelivery;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class CampaignController extends Controller
{
    public function create(Request $request) {
        $v=$request->validate(['name'=>'required|string|max:150','channel'=>'required|in:email,sms','kind'=>'required|in:idle_follow_up,post_clean_review','scheduled_at'=>'required|date|after:now']);
        $id=DB::table('campaigns')->insertGetId(['name'=>$v['name'],'channel'=>$v['channel'],'kind'=>$v['kind'],'status'=>'draft','template_key'=>$v['kind'],'template_version'=>1,'segment_filters'=>json_encode([]),'created_by'=>$request->user()->id,'scheduled_at'=>$v['scheduled_at'],'created_at'=>now(),'updated_at'=>now()]);
        return response()->json(['campaign_id'=>$id,'status'=>'draft'],201);
    }
    public function approve(Request $request, int $id) {
        $changed=DB::table('campaigns')->where('id',$id)->where('status','draft')->update(['status'=>'approved','updated_at'=>now()]); abort_unless($changed,409,'Campaign must be in draft');
        DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'campaign','entity_id'=>$id,'action'=>'approved','created_at'=>now(),'updated_at'=>now()]);
        return response()->json(['status'=>'approved']);
    }
}
