import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  // Private pages receive noindex headers; allow crawling so that directive can be read.
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }], sitemap: 'https://www.expresscleaningconsult.com/sitemap.xml' };
}
