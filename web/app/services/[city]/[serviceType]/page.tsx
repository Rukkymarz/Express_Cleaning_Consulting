import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import BeforeAfterGallery from '@/components/BeforeAfterGallery';
import ReviewsSection from '@/components/ReviewsSection';

type Params = Promise<{ city: string; serviceType: string }>;
type Catalog = { services: {code:string;slug:string;name:string;description:string}[]; markets: {slug:string;city:string;region:string;status:string}[] };
async function catalog(): Promise<Catalog> {
  const r = await fetch(`${API_URL}/catalog`, { cache: 'no-store' });
  if (!r.ok) return { services: [], markets: [] };
  return r.json();
}
async function resolve(params: Params) {
  const p = await params; const data = await catalog();
  const market = data.markets.find(m=>m.slug===p.city);
  const service = data.services.find(s=>s.slug===p.serviceType);
  if (!market || !service) notFound();
  return { market, service };
}
export async function generateMetadata({ params }: {params:Params}): Promise<Metadata> {
  const { market, service } = await resolve(params);
  return { title: `${service.name} in ${market.city}, ${market.region}`, description: `Request a cleaning quote for ${service.name.toLowerCase()} in ${market.city}. Scope and availability are confirmed before booking.`, alternates: {canonical:`/services/${market.slug}/${service.slug}`} };
}
export default async function LocalServicePage({params}:{params:Params}) {
  const {market,service}=await resolve(params);
  const data = { '@context':'https://schema.org', '@type':'Service', name:service.name, serviceType:'Cleaning service', provider:{'@type':'Organization',name:'Express Cleaning Consult',url:'https://www.expresscleaningconsult.com'}, areaServed:{'@type':'City',name:market.city,address:{'@type':'PostalAddress',addressRegion:market.region,addressCountry:'US'}} };
  return <main><div className="mx-auto max-w-4xl px-5 py-12"><Link href="/" className="font-bold text-ocean underline">← Express Cleaning Consult</Link><p className="mt-14 font-bold uppercase tracking-[.16em] text-ocean">{market.city}, {market.region}</p><h1 className="mt-4 text-4xl font-bold">{service.name}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{service.description || `Tell us what needs cleaning in ${market.city}. We will review your request and confirm pricing and local availability before scheduling.`}</p><p className="mt-5 text-slate-600">A requested date is a preference until our team confirms your appointment.</p><Link href={`/book?service=${encodeURIComponent(service.code)}`} className="mt-9 inline-block rounded-xl bg-ocean px-7 py-4 font-bold text-white">Request a free quote</Link><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(data).replace(/</g,'\\u003c')}} /></div><BeforeAfterGallery serviceCode={service.code} /><ReviewsSection /></main>;
}
