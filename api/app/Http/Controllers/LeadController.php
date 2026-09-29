<?php
namespace App\Http\Controllers;

use App\Models\User;
use App\Services\LeadService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class LeadController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'stage' => 'nullable|in:new_lead,quote_requested,quote_sent,booked,completed',
            'agent_id' => 'nullable|integer|exists:users,id',
            'unassigned' => 'nullable|boolean',
            'search' => 'nullable|string|max:100',
        ]);
        $query = DB::table('leads');
        if (!empty($filters['stage'])) $query->where('pipeline_stage', $filters['stage']);
        if (!empty($filters['agent_id'])) $query->where('assigned_agent_id', $filters['agent_id']);
        if (!empty($filters['unassigned'])) $query->whereNull('assigned_agent_id');
        if (!empty($filters['search'])) {
            $term = addcslashes(trim($filters['search']), '%_\\');
            $query->where(fn ($q) => $q->where('name', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%"));
        }
        return response()->json($query->orderByDesc('lead_score')->orderByDesc('id')
            ->cursorPaginate(25, ['id','public_id','name','email','phone','source','status','pipeline_stage','lead_score','assigned_agent_id','next_follow_up_at','created_at']));
    }

    public function show(int $id)
    {
        $lead = DB::table('leads')->where('id', $id)->first(); abort_unless($lead, 404);
        return response()->json([
            'lead' => $lead,
            'requests' => DB::table('service_requests')->where('lead_id', $id)->orderByDesc('id')->limit(20)->get(),
            'quotes' => DB::table('quotes as q')->join('service_requests as sr','sr.id','=','q.service_request_id')
                ->where('sr.lead_id',$id)->orderByDesc('q.id')->limit(20)->get(['q.public_id','q.status','q.total_cents','q.deposit_cents','q.expires_at']),
            'calls' => DB::table('calls')->where('lead_id', $id)->orderByDesc('id')->limit(20)->get(['id','status','disposition','notes','created_at']),
        ]);
    }

    public function agents()
    {
        return response()->json(User::permission('leads.edit')->orderBy('name')->get(['id','name','email']));
    }

    public function update(Request $request, int $id, LeadService $leads)
    {
        $data = $request->validate([
            'status' => 'sometimes|in:new,contacted,qualified,follow_up,lost',
            'next_follow_up_at' => 'sometimes|nullable|date',
        ]);
        abort_if(!$data, 422, 'Nothing to update');
        DB::transaction(function () use ($request,$id,$data,$leads) {
            $lead = DB::table('leads')->where('id',$id)->lockForUpdate()->first(); abort_unless($lead,404);
            DB::table('leads')->where('id',$id)->update([...$data,'updated_at'=>now()]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'lead','entity_id'=>$id,
                'action'=>'disposition.updated','changes'=>json_encode(['before'=>['status'=>$lead->status,'next_follow_up_at'=>$lead->next_follow_up_at],'after'=>$data]),
                'created_at'=>now(),'updated_at'=>now()]);
            $leads->sync($id);
        });
        return response()->noContent();
    }

    public function assign(Request $request, int $id, LeadService $leads)
    {
        $data = $request->validate(['agent_id'=>'required|integer|exists:users,id']);
        $agent = User::permission('leads.edit')->find($data['agent_id']);
        abort_unless($agent,422,'Assign to an approved sales agent');
        DB::transaction(function () use ($request,$id,$agent,$leads) {
            $lead = DB::table('leads')->where('id',$id)->lockForUpdate()->first(); abort_unless($lead,404);
            DB::table('leads')->where('id',$id)->update(['assigned_agent_id'=>$agent->id,'updated_at'=>now()]);
            DB::table('audit_events')->insert(['actor_id'=>$request->user()->id,'entity_type'=>'lead','entity_id'=>$id,
                'action'=>'agent.assigned','changes'=>json_encode(['from'=>$lead->assigned_agent_id,'to'=>$agent->id]),
                'created_at'=>now(),'updated_at'=>now()]);
            $leads->sync($id);
        });
        return response()->json(['agent_id'=>$agent->id]);
    }
}
