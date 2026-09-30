import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  const origin=(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.expresscleaningconsult.com').replace(/\/$/, '');
  return {rules:[{userAgent:'*',allow:['/','/book','/services/'],disallow:['/account/','/admin/','/worker/']}],sitemap:`${origin}/sitemap.xml`};
}
