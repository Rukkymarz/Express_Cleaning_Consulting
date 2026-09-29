import Link from 'next/link';
import LeadPipelineBoard from '@/components/LeadPipelineBoard';
export default function AdminPage() {
  return <main className="mx-auto max-w-7xl px-5 py-9">
    <header className="flex flex-wrap justify-between gap-4"><Link href="/" className="font-bold text-ocean underline">Express Cleaning Consult</Link><Link href="/admin/calls" className="rounded-xl bg-ocean px-5 py-3 font-bold text-white">Open call center</Link></header>
    <h1 className="mt-12 text-4xl font-bold">Lead pipeline</h1>
    <p className="mt-3 text-slate-600">Review requests, assign an agent, and track each lead through confirmed service.</p>
    <LeadPipelineBoard />
  </main>;
}
