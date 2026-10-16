import {serviceGuides} from '@/lib/services';
import type {MetadataRoute} from 'next';
import {confirmedMarkets,localServices} from '@/lib/launch';
export default function sitemap():MetadataRoute.Sitemap{const origin='https://www.expresscleaningconsult.com';return [{url:origin,changeFrequency:'weekly',priority:1},...['/services','/book','/property-managers','/partner-cleaners','/refer-a-client','/privacy','/terms'].map(p=>({url:origin+p,changeFrequency:'monthly' as const,priority:p==='/book'?.8:.6})),...serviceGuides.map(s=>({url:`${origin}/services/${s.slug}`,changeFrequency:'monthly' as const,priority:.8})),...confirmedMarkets.flatMap(m=>localServices.map(s=>({url:`${origin}/${m.slug}/${s.slug}`,changeFrequency:'monthly' as const,priority:.7})))];}
