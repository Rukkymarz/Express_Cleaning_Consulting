'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { jsonRequest } from '@/lib/api';

type Stage='new_lead'|'quote_requested'|'quote_sent'|'booked'|'completed';
type TaskStatus='open'|'in_progress'|'completed';
type Lead={id:number;name:string;email:string|null;phone:string|null;status:string;pipeline_stage:Stage;lead_score:number;assigned_agent_id:number|null;next_follow_up_at:string|null;created_at:string;request_receipt:string|null;service_name:string|null;street:string|null;unit:string|null;city:string|null;region:string|null;postal_code:string|null;task_id:string|null;task_status:TaskStatus|null;notification_status:string|null};
type Agent={id:number;name:string;email:string};
const stages:Stage[]=['new_lead','quote_requested','quote_sent','booked','completed'];
const labels:Record<Stage,string>={new_lead:'New lead',quote_requested:'Quote requested',quote_sent:'Quote sent',booked:'Booked',completed:'Completed'};

export default function LeadPipelineBoard() {
  const [stage,setStage]=useState<Stage>('quote_requested');
  const [leads,setLeads]=useState<Lead[]>([]),[agents,setAgents]=useState<Agent[]>([]);
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
  useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all([fetchPage(),jsonRequest<Agent[]>('/admin/agents').then(result=>{if(active)setAgents(result);})]).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;requestSequence.current++;};},[fetchPage]);
  useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==='visible')fetchPage().catch(()=>{});},15000);return()=>clearInterval(timer);},[fetchPage]);
  async function assign(id:number,agent_id:number) {
    setError('');setNotice('');
    try {await jsonRequest(`/admin/leads/${id}/assignment`,{method:'PATCH',body:JSON.stringify({agent_id})});setNotice('Agent assignment saved.');await fetchPage();}
    catch(e){setError(e instanceof Error?e.message:'Unable to assign agent');}
  }
  async function markFollowUp(id:number) {
    setError('');setNotice('');
    try {await jsonRequest(`/admin/leads/${id}`,{method:'PATCH',body:JSON.stringify({status:'follow_up'})});setNotice('Lead marked for follow-up.');await fetchPage();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update lead');}
  }
  async function updateTask(taskId:string,status:TaskStatus) {
    setError('');setNotice('');
    try {await jsonRequest(`/admin/tasks/${taskId}`,{method:'PATCH',body:JSON.stringify({status})});setNotice(`Review task marked ${status.replaceAll('_',' ')}.`);await fetchPage();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update review task');}
  }
  return <section aria-label="Lead pipeline" className="mt-9">
    <div role="group" aria-label="Pipeline stage" className="flex flex-wrap gap-2">{stages.map(s=><button key={s} aria-pressed={stage===s} onClick={()=>{setStage(s);setError('');}} className={`rounded-full px-4 py-2 text-sm font-bold ${stage===s?'bg-ocean text-white':'border border-platinum-dark bg-white text-ink'}`}>{labels[s]}</button>)}</div>
    <div className="mt-7 flex flex-wrap items-end gap-3"><div><label htmlFor="lead-search" className="block text-sm font-semibold">Search this stage</label><input id="lead-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, email, phone or receipt" className="mt-2 rounded-xl border border-platinum-dark bg-white p-3" /></div><Link href="/admin/calls" className="rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Call leads</Link></div>
    <p className="mt-3 text-sm text-slate-600">Score ranks follow-up work from contact and request details; it is not a conversion probability.</p>
    {notice&&<p role="status" className="mt-4 text-ocean">{notice}</p>}{error&&<p role="alert" className="mt-4 text-red-700">{error} <Link href="/login" className="underline">Sign in if needed</Link></p>}
    {loading?<p role="status" className="mt-8">Loading leads…</p>:error?<button onClick={()=>{setLoading(true);fetchPage().catch(e=>setError(e.message)).finally(()=>setLoading(false));}} className="mt-6 rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Retry loading leads</button>:leads.length===0?<p className="mt-8 rounded-2xl border border-platinum bg-white p-7">No leads in this stage.</p>:
      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{leads.map(lead=><li key={lead.id} className="rounded-2xl border border-platinum bg-white p-6">
        <div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold">{lead.name}</h2><p className="mt-1 break-all text-sm text-slate-600">{lead.email||'Email pending'}</p><p className="mt-1 text-sm text-slate-600">{lead.phone||'Phone pending'}</p></div><span className="h-fit rounded-lg bg-[#EAF5F2] px-3 py-2 text-sm font-bold text-ocean">{lead.lead_score}/100</span></div>
        {lead.request_receipt&&<div className="mt-5 rounded-xl border border-platinum bg-canvas p-4 text-sm"><p><span className="font-semibold">Receipt:</span> <span className="break-all">{lead.request_receipt}</span></p><p className="mt-2"><span className="font-semibold">Service:</span> {lead.service_name||'Not available'}</p><p className="mt-2"><span className="font-semibold">Location:</span> {[lead.street,lead.unit,lead.city,lead.region,lead.postal_code].filter(Boolean).join(', ')}</p><p className="mt-2"><span className="font-semibold">Review task:</span> {lead.task_status?.replaceAll('_',' ')||'Not created'}</p><p className="mt-2"><span className="font-semibold">Email notice:</span> {lead.notification_status?.replaceAll('_',' ')||'Not created'}</p></div>}
        <p className="mt-4 text-sm text-slate-600">Disposition: {lead.status.replaceAll('_',' ')}{lead.next_follow_up_at?` · Follow up ${new Date(lead.next_follow_up_at).toLocaleDateString()}`:''}</p>
        <label htmlFor={`agent-${lead.id}`} className="mt-5 block text-sm font-semibold">Assigned agent</label><select id={`agent-${lead.id}`} value={lead.assigned_agent_id??''} onChange={e=>e.target.value&&assign(lead.id,Number(e.target.value))} className="mt-2 w-full rounded-xl border border-platinum-dark p-3"><option value="">Unassigned</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <div className="mt-4 flex flex-wrap gap-3"><button onClick={()=>markFollowUp(lead.id)} className="font-bold text-ocean underline underline-offset-4">Mark lead for follow-up</button>{lead.task_id&&lead.task_status!=='completed'&&<button onClick={()=>updateTask(lead.task_id!,lead.task_status==='open'?'in_progress':'completed')} className="font-bold text-ocean underline underline-offset-4">{lead.task_status==='open'?'Start review':'Complete review'}</button>}</div>
      </li>)}</ul>}
    {cursor&&<button onClick={()=>fetchPage(cursor).catch(e=>setError(e.message))} className="mt-6 rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Load more</button>}
  </section>;
}
