'use client';
import {useEffect,useRef,useState} from 'react';
import {jsonRequest} from '@/lib/api';

type Inquiry={public_id:string;kind:string;name:string|null;email:string;status:string;details:string;created_at:string};

export default function InquiryInbox(){
  const [rows,setRows]=useState<Inquiry[]>([]);
  const [kind,setKind]=useState('');
  const [page,setPage]=useState(1);
  const [last,setLast]=useState(1);
  const [permissions,setPermissions]=useState<string[]>([]);
  const [sessionLoaded,setSessionLoaded]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const sequence=useRef(0);
  const canEdit=permissions.includes('leads.edit');

  async function load(){
    const current=++sequence.current;setBusy(true);setError('');
    try{
      const result=await jsonRequest<{data:Inquiry[];last_page:number}>(`/admin/inquiries?page=${page}${kind?`&kind=${kind}`:''}`);
      if(current===sequence.current){setRows(result.data);setLast(result.last_page);}
    }catch(reason){
      if(current===sequence.current){setRows([]);setError(reason instanceof Error?reason.message:'Unable to load inquiries.');}
    }finally{if(current===sequence.current)setBusy(false);}
  }

  useEffect(()=>{load();},[kind,page]);
  useEffect(()=>{let active=true;jsonRequest<{permissions:string[]}>('/session').then(session=>{if(active)setPermissions(session.permissions);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Unable to load staff permissions.');}).finally(()=>{if(active)setSessionLoaded(true);});return()=>{active=false;};},[]);

  async function status(id:string,value:string){
    if(!canEdit)return;
    try{await jsonRequest(`/admin/inquiries/${id}`,{method:'PATCH',body:JSON.stringify({status:value})});await load();}
    catch(reason){setError(reason instanceof Error?reason.message:'Unable to update.');}
  }

  return <section className="mt-8">
    <label className="font-semibold">Inquiry type <select className="ml-3 rounded border p-2" value={kind} onChange={event=>{setKind(event.target.value);setPage(1);}}><option value="">All</option>{['partner','vendor','referral','discount'].map(value=><option key={value}>{value}</option>)}</select></label>
    {sessionLoaded&&!canEdit&&!error&&<p className="mt-5 rounded-xl border border-platinum bg-white p-4 text-sm text-slate-600">You can review inquiries, but changing their status requires lead-edit permission.</p>}
    {error&&<p role="alert" className="mt-5 text-red-700">{error} <a href="/login" className="underline">Sign in</a></p>}
    {busy&&<p role="status">Loading…</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Received','Type','Contact','Details','Status'].map(title=><th className="border-b p-3" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.public_id}>
      <td className="border-b p-3">{new Date(row.created_at).toLocaleDateString()}<small className="block">{row.public_id}</small></td>
      <td className="border-b p-3">{row.kind}</td>
      <td className="border-b p-3">{row.name||'Offer request'}<a className="block underline" href={`mailto:${row.email}`}>{row.email}</a></td>
      <td className="border-b p-3"><details><summary className="cursor-pointer">View submitted details</summary><dl className="min-w-64">{Object.entries(typeof row.details==='string'?JSON.parse(row.details):row.details).map(([key,value])=><div key={key} className="py-1"><dt className="font-semibold">{key.replaceAll('_',' ')}</dt><dd className="whitespace-pre-wrap">{typeof value==='boolean'?(value?'Yes':'No'):String(value??'')}</dd></div>)}</dl></details></td>
      <td className="border-b p-3">{canEdit?<select aria-label={`Status for ${row.name||row.public_id}`} value={row.status} onChange={event=>status(row.public_id,event.target.value)} className="rounded border p-2">{['open','in_progress','completed'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select>:<span className="capitalize">{row.status.replaceAll('_',' ')}</span>}</td>
    </tr>)}</tbody></table></div>
    {!busy&&!error&&!rows.length&&<p className="mt-5">No inquiries yet.</p>}
    <div className="mt-5 flex gap-4"><button disabled={page<=1||busy} onClick={()=>setPage(value=>value-1)}>Previous</button><span>{page} / {last}</span><button disabled={page>=last||busy} onClick={()=>setPage(value=>value+1)}>Next</button></div>
  </section>;
}
