import Link from 'next/link';
import LeadPipelineBoard from '@/components/LeadPipelineBoard';
export default function AdminPage() {
  return <main className="mx-auto max-w-7xl px-5 py-9">
    <header className="flex flex-wrap justify-between gap-4"><Link href="/" className="font-bold text-ocean underline">Express Cleaning Consult</Link></header>
    <nav aria-label="Admin tools" className="mt-6 flex flex-wrap gap-3"><Link href="/admin" aria-current="page" className="rounded-xl bg-ocean px-5 py-3 font-bold text-white">Lead pipeline</Link><Link href="/admin/prospects" className="rounded-xl border border-ocean px-5 py-3 font-bold text-ocean">Lead generation</Link></nav>
    <h1 className="mt-12 text-4xl font-bold">Lead pipeline</h1>
    <p className="mt-3 text-slate-600">Review requests, assign an agent, and track each lead through confirmed service.</p>
    <LeadPipelineBoard />
  </main>;
}
