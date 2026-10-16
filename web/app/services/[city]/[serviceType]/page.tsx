import {notFound,permanentRedirect} from 'next/navigation';
import {confirmedMarkets,localServices} from '@/lib/launch';
export default async function LegacyPage({params}:{params:Promise<{city:string;serviceType:string}>}){const p=await params;if(!confirmedMarkets.some(m=>m.slug===p.city)||!localServices.some(s=>s.slug===p.serviceType))notFound();permanentRedirect(`/${p.city}/${p.serviceType}`);}
