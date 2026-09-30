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
        $latestRequests = DB::table('service_requests')
            ->selectRaw('lead_id, MAX(id) as service_request_id')
            ->groupBy('lead_id');
        $query = DB::table('leads as l')
            ->leftJoinSub($latestRequests, 'latest_request', 'latest_request.lead_id', '=', 'l.id')
            ->leftJoin('service_requests as sr', 'sr.id', '=', 'latest_request.service_request_id')
            ->leftJoin('service_types as service', 'service.id', '=', 'sr.service_type_id')
            ->leftJoin('addresses as address', 'address.id', '=', 'sr.address_id')
            ->leftJoin('staff_tasks as task', function ($join) {
                $join->on('task.service_request_id', '=', 'sr.id')->where('task.kind', '=', 'quote_review');
            })
            ->leftJoin('quote_request_notifications as notification', 'notification.service_request_id', '=', 'sr.id');
        if (!empty($filters['stage'])) $query->where('l.pipeline_stage', $filters['stage']);
        if (!empty($filters['agent_id'])) $query->where('l.assigned_agent_id', $filters['agent_id']);
        if (!empty($filters['unassigned'])) $query->whereNull('l.assigned_agent_id');
        if (!empty($filters['search'])) {
            $term = addcslashes(trim($filters['search']), '%_\\');
            $query->where(fn ($q) => $q->where('l.name', 'like', "%{$term}%")
                ->orWhere('l.email', 'like', "%{$term}%")
                ->orWhere('l.phone', 'like', "%{$term}%")
                ->orWhere('sr.public_id', 'like', "%{$term}%"));
        }
        return response()->json($query->orderByDesc('l.lead_score')->orderByDesc('l.id')
            ->cursorPaginate(25, [
                'l.id', 'l.public_id', 'l.name', 'l.email', 'l.phone', 'l.source', 'l.status',
                'l.pipeline_stage', 'l.lead_score', 'l.assigned_agent_id', 'l.next_follow_up_at', 'l.created_at',
                'sr.public_id as request_receipt', 'service.name as service_name',
                'address.street', 'address.unit', 'address.city', 'address.region', 'address.postal_code',
                'task.public_id as task_id', 'task.status as task_status',
                'notification.status as notification_status',
            ]));
    }

    public function show(int $id)
    {
        $lead = DB::table('leads')->where('id', $id)->first(); abort_unless($lead, 404);
        return response()->json([
            'lead' => $lead,
            'requests' => DB::table('service_requests as sr')
                ->join('service_types as service', 'service.id', '=', 'sr.service_type_id')
                ->join('addresses as address', 'address.id', '=', 'sr.address_id')
                ->leftJoin('staff_tasks as task', function ($join) {
                    $join->on('task.service_request_id', '=', 'sr.id')->where('task.kind', '=', 'quote_review');
                })
                ->leftJoin('quote_request_notifications as notification', 'notification.service_request_id', '=', 'sr.id')
                ->where('sr.lead_id', $id)->orderByDesc('sr.id')->limit(20)
                ->get([
                    'sr.*', 'service.name as service_name', 'address.street', 'address.unit',
                    'address.city', 'address.region', 'address.postal_code',
                    'task.public_id as task_id', 'task.status as task_status',
                    'notification.status as notification_status',
                ]),
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

    public function updateTask(Request $request, string $publicId)
    {
        $data = $request->validate(['status' => 'required|in:open,in_progress,completed']);
        $task = DB::transaction(function () use ($request, $publicId, $data) {
            $task = DB::table('staff_tasks')->where('public_id', $publicId)->lockForUpdate()->first();
            abort_unless($task, 404);
            $completedAt = $data['status'] === 'completed' ? now() : null;
            DB::table('staff_tasks')->where('id', $task->id)->update([
                'status' => $data['status'],
                'completed_at' => $completedAt,
                'updated_at' => now(),
            ]);
            DB::table('audit_events')->insert([
                'actor_id' => $request->user()->id,
                'entity_type' => 'staff_task',
                'entity_id' => $task->id,
                'action' => 'status.updated',
                'changes' => json_encode(['from' => $task->status, 'to' => $data['status']]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            return ['task_id' => $publicId, 'status' => $data['status'], 'completed_at' => $completedAt];
        });

        return response()->json($task);
    }
}
