import Link from 'next/link';
import InquiryInbox from '@/components/InquiryInbox';
export default function Page(){return <main className="mx-auto max-w-7xl px-5 py-10"><Link href="/admin" className="font-bold text-ocean underline">← Lead pipeline</Link><h1 className="mt-10 text-4xl font-bold">Website inquiries</h1><p className="mt-3 text-slate-600">Review partner applications, vendor setup, referrals and first-clean offers. Access requires staff permissions.</p><InquiryInbox/></main>;}
