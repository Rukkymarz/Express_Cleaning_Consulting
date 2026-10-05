import type { MetadataRoute } from 'next';
import { API_URL } from '@/lib/api';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = 'https://www.expresscleaningconsult.com';
  const base: MetadataRoute.Sitemap = [{url:origin,changeFrequency:'weekly',priority:1},{url:`${origin}/book`,changeFrequency:'monthly',priority:.8}];
  try {
    const r=await fetch(`${API_URL}/catalog`,{cache:'no-store'}); if(!r.ok) return base;
    const data=await r.json() as {services:{slug:string}[];markets:{slug:string}[]};
    return [...base,...data.markets.flatMap(m=>data.services.map(s=>({url:`${origin}/services/${m.slug}/${s.slug}`,changeFrequency:'monthly' as const,priority:.5})))];
  } catch { return base; }
}
