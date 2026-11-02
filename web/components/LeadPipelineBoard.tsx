'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';
import QuoteWorkflowPanel from '@/components/QuoteWorkflowPanel';

type Stage='new_lead'|'quote_requested'|'quote_sent'|'booked'|'completed';
type TaskStatus='open'|'in_progress'|'completed';
type Lead={id:number;name:string;email:string|null;phone:string|null;status:string;pipeline_stage:Stage;lead_score:number;assigned_agent_id:number|null;next_follow_up_at:string|null;created_at:string;request_receipt:string|null;service_name:string|null;street:string|null;unit:string|null;city:string|null;region:string|null;postal_code:string|null;task_id:string|null;task_status:TaskStatus|null;notification_status:string|null;service_request_id:number|null;customer_linked:boolean;customer_email:string|null;quote_id:string|null;quote_status:string|null;quote_total_cents:number|null;quote_deposit_cents:number|null;quote_expires_at:string|null;booking_id:string|null;booking_status:string|null};
type Agent={id:number;name:string;email:string};
type Worker={id:number;name:string;email:string};
const stages:Stage[]=['new_lead','quote_requested','quote_sent','booked','completed'];
const labels:Record<Stage,string>={new_lead:'New lead',quote_requested:'Quote requested',quote_sent:'Quote sent',booked:'Booked',completed:'Completed'};
function localDateTime(value:string|null){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export default function LeadPipelineBoard() {
  const [stage,setStage]=useState<Stage>('quote_requested');
  const [leads,setLeads]=useState<Lead[]>([]),[agents,setAgents]=useState<Agent[]>([]),[workers,setWorkers]=useState<Worker[]>([]);
  const [permissions,setPermissions]=useState<string[]>([]);
  const [cursor,setCursor]=useState<string|null>(null),[search,setSearch]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
  const requestSequence=useRef(0);
  const [searchTerm,setSearchTerm]=useState('');
  useEffect(()=>{const timer=window.setTimeout(()=>setSearchTerm(search),250);return()=>window.clearTimeout(timer);},[search]);
  const fetchPage=useCallback(async (next?:string) => {
    const requestId=++requestSequence.current;
    const query=new URLSearchParams({stage});if(searchTerm.trim())query.set('search',searchTerm.trim());if(next)query.set('cursor',next);
    const result=await jsonRequest<{data:Lead[];next_cursor:string|null}>(`/admin/leads?${query}`);
    if(requestId!==requestSequence.current)return;
    setError('');
    setLeads(old=>next?[...old,...result.data]:result.data);setCursor(result.next_cursor);
  },[stage,searchTerm]);
  useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all([fetchPage(),jsonRequest<Agent[]>('/admin/agents').then(result=>{if(active)setAgents(result);}),jsonRequest<Worker[]>('/admin/workers').then(result=>{if(active)setWorkers(result);}).catch(()=>{if(active)setWorkers([]);}),jsonRequest<{permissions:string[]}>('/session').then(result=>{if(active)setPermissions(result.permissions);})]).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;requestSequence.current++;};},[fetchPage]);
  useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==='visible')fetchPage().catch(()=>{});},15000);return()=>clearInterval(timer);},[fetchPage]);
  async function assign(id:number,agent_id:number) {
    setError('');setNotice('');
    try {await jsonRequest(`/admin/leads/${id}/assignment`,{method:'PATCH',body:JSON.stringify({agent_id})});setNotice('Agent assignment saved.');await fetchPage();}
    catch(e){setError(e instanceof Error?e.message:'Unable to assign agent');}
  }
  async function saveFollowUp(id:number,value:string|null) {
    setError('');setNotice('');
    try {
      await jsonRequest(`/admin/leads/${id}`,{method:'PATCH',body:JSON.stringify(value?{status:'follow_up',next_follow_up_at:new Date(value).toISOString()}:{next_follow_up_at:null})});
      setNotice(value?'Follow-up date and time saved.':'Follow-up date and time cleared.');await fetchPage();return true;
    }
    catch(e){setError(e instanceof Error?e.message:'Unable to update lead');return false;}
  }
  async function updateTask(taskId:string,status:TaskStatus) {
    setError('');setNotice('');
    try {await jsonRequest(`/admin/tasks/${taskId}`,{method:'PATCH',body:JSON.stringify({status})});setNotice(`Review task marked ${status.replaceAll('_',' ')}.`);await fetchPage();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update review task');}
  }
  return <section aria-label="Lead pipeline" className="mt-9">
    <div role="group" aria-label="Pipeline stage" className="flex flex-wrap gap-2">{stages.map(s=><button key={s} aria-pressed={stage===s} onClick={()=>{setStage(s);setError('');}} className={`rounded-full px-4 py-2 text-sm font-bold ${stage===s?'bg-ocean text-white':'border border-platinum-dark bg-white text-ink'}`}>{labels[s]}</button>)}</div>
    <div className="mt-7 flex flex-wrap items-end gap-3"><div><label htmlFor="lead-search" className="block text-sm font-semibold">Search this stage</label><input id="lead-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, email, phone or receipt" className="mt-2 rounded-xl border border-platinum-dark bg-white p-3" /></div>{permissions.includes('leads.export')&&<a href="/api/v1/admin/leads.csv" className="rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Export lead CSV</a>}</div>
    <p className="mt-3 text-sm text-slate-600">Score ranks follow-up work from contact and request details; it is not a conversion probability.</p>
    {notice&&<p role="status" className="mt-4 text-ocean">{notice}</p>}{error&&<p role="alert" className="mt-4 text-red-700">{error} <Link href="/login" className="underline">Sign in if needed</Link></p>}
    {loading?<p role="status" className="mt-8">Loading leads…</p>:error?<button onClick={()=>{setLoading(true);fetchPage().catch(e=>setError(e.message)).finally(()=>setLoading(false));}} className="mt-6 rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Retry loading leads</button>:leads.length===0?<p className="mt-8 rounded-2xl border border-platinum bg-white p-7">No leads in this stage.</p>:
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">{leads.map(lead=><li key={lead.id} className="rounded-2xl border border-platinum bg-white p-6">
        <div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold">{lead.name}</h2><p className="mt-1 break-all text-sm text-slate-600">{lead.email||'Email pending'}</p><p className="mt-1 text-sm text-slate-600">{lead.phone?<a href={`tel:${lead.phone}`} className="font-semibold text-ocean underline">{lead.phone}</a>:'Phone pending'}</p></div><span className="h-fit rounded-lg bg-[#EAF5F2] px-3 py-2 text-sm font-bold text-ocean">{lead.lead_score}/100</span></div>
        {lead.request_receipt&&<div className="mt-5 rounded-xl border border-platinum bg-canvas p-4 text-sm"><p><span className="font-semibold">Receipt:</span> <span className="break-all">{lead.request_receipt}</span></p><p className="mt-2"><span className="font-semibold">Service:</span> {lead.service_name||'Not available'}</p><p className="mt-2"><span className="font-semibold">Location:</span> {[lead.street,lead.unit,lead.city,lead.region,lead.postal_code].filter(Boolean).join(', ')}</p><p className="mt-2"><span className="font-semibold">Review task:</span> {lead.task_status?.replaceAll('_',' ')||'Not created'}</p><p className="mt-2"><span className="font-semibold">Email notice:</span> {lead.notification_status?.replaceAll('_',' ')||'Not created'}</p></div>}
        <p className="mt-4 text-sm text-slate-600">Disposition: {lead.status.replaceAll('_',' ')}{lead.next_follow_up_at?` · Follow up ${new Date(lead.next_follow_up_at).toLocaleDateString()}`:''}</p>
        {permissions.includes('leads.edit')?<><label htmlFor={`agent-${lead.id}`} className="mt-5 block text-sm font-semibold">Assigned agent</label><select id={`agent-${lead.id}`} value={lead.assigned_agent_id??''} onChange={e=>e.target.value&&assign(lead.id,Number(e.target.value))} className="mt-2 w-full rounded-xl border border-platinum-dark p-3"><option value="">Unassigned</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><LeadFollowUpEditor key={`${lead.id}-${lead.next_follow_up_at}`} lead={lead} onSave={saveFollowUp}/><div className="mt-4 flex flex-wrap gap-3">{lead.task_id&&lead.task_status!=='completed'&&<button onClick={()=>updateTask(lead.task_id!,lead.task_status==='open'?'in_progress':'completed')} className="font-bold text-ocean underline underline-offset-4">{lead.task_status==='open'?'Start review':'Complete review'}</button>}</div></>:<p className="mt-5 text-sm text-slate-600"><span className="font-semibold">Assigned agent:</span> {agents.find(agent=>agent.id===lead.assigned_agent_id)?.name||'Unassigned'}. Lead, follow-up, and review-task changes require lead-edit permission.</p>}
        {lead.service_request_id&&(permissions.includes('quotes.issue')||permissions.includes('bookings.dispatch')||permissions.includes('payments.issue'))&&<QuoteWorkflowPanel lead={lead} workers={workers} canIssue={permissions.includes('quotes.issue')} canDispatch={permissions.includes('bookings.dispatch')} canPay={permissions.includes('payments.issue')} onChanged={()=>fetchPage()} />}
      </li>)}</ul>}
    {cursor&&<button onClick={()=>fetchPage(cursor).catch(e=>setError(e.message))} className="mt-6 rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Load more</button>}
  </section>;
}

function LeadFollowUpEditor({lead,onSave}:{lead:Lead;onSave:(id:number,value:string|null)=>Promise<boolean>}){
  const [value,setValue]=useState(localDateTime(lead.next_follow_up_at));
  const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);try{await onSave(lead.id,value);}finally{setBusy(false);}}
  async function clear(){if(!lead.next_follow_up_at){setValue('');return;}setBusy(true);try{if(await onSave(lead.id,null))setValue('');}finally{setBusy(false);}}
  return <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-platinum bg-canvas p-4"><label htmlFor={`follow-up-${lead.id}`} className="text-sm font-semibold">Next follow-up date and time<input id={`follow-up-${lead.id}`} type="datetime-local" required value={value} onChange={event=>setValue(event.target.value)} className="mt-2 w-full rounded-xl border border-platinum-dark bg-white p-3"/></label><p className="text-xs text-slate-500">Uses your device&apos;s time zone.</p><div className="flex flex-wrap gap-3"><button disabled={busy} className="rounded-xl border border-ocean px-4 py-2 font-bold text-ocean disabled:opacity-50">{busy?'Saving…':lead.next_follow_up_at?'Change follow-up':'Create follow-up'}</button>{(lead.next_follow_up_at||value)&&<button type="button" disabled={busy} onClick={clear} className="font-bold text-red-700 underline underline-offset-4 disabled:opacity-50">Clear follow-up</button>}</div></form>;
}
