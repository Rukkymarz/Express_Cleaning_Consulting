import type { Metadata } from 'next';
import {notFound} from 'next/navigation';
import PublicShell from '@/components/PublicShell';
import Guarantee from '@/components/Guarantee';
import {confirmedMarkets,localServices} from '@/lib/launch';
type Params=Promise<{city:string;serviceType:string}>;
async function resolve(params:Params){const p=await params;const market=confirmedMarkets.find(m=>m.slug===p.city);const service=localServices.find(s=>s.slug===p.serviceType);if(!market||!service)notFound();return {market,service};}
export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{const {market,service}=await resolve(params);return {title:{absolute:`${service.name} in ${market.city} | Free Quote | Express Cleaning Consult`},description:`Request a free ${service.name.toLowerCase()} quote in ${market.city}. Approve the price before booking.`,alternates:{canonical:`/${market.slug}/${service.slug}`}};}
export default async function Page({params}:{params:Params}){const {market,service}=await resolve(params);return <PublicShell><span className="ecc-eyebrow">{market.city}, {market.region}</span><h1>{service.name}<br/><em>in {market.city}.</em></h1><p className="ecc-page-lead">{market.description}</p><p>Tell us about the property, service scope and preferred date. We confirm availability and provide a free written quote before booking.</p><a className="ecc-button" href={`/book?service=${service.code}&city=${encodeURIComponent(market.city)}&state=${market.region}`}>Get a free quote →</a><Guarantee/></PublicShell>;}
