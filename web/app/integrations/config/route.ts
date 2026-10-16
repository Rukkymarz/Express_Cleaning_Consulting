export const dynamic = 'force-dynamic';

function scriptUrl(value: string | undefined, provider: 'hubspot' | 'salesiq') {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    const valid = provider === 'hubspot'
      ? /^(js|js-na1|js-na2|js-eu1)\.hs-scripts\.com$/.test(url.hostname) && /^\/\d+\.js$/.test(url.pathname) && !url.search
      : /^salesiq\.zohopublic\.(com|eu|in|com\.au|ca|jp|com\.cn|sa)$/.test(url.hostname) && url.pathname === '/widget' && !!url.searchParams.get('wc');
    return valid ? url.href : null;
  } catch { return null; }
}

export function GET() {
  return Response.json({
    ga4: /^G-[A-Z0-9]+$/.test(process.env.GA4_MEASUREMENT_ID || '') ? process.env.GA4_MEASUREMENT_ID : null,
    meta: /^\d{5,25}$/.test(process.env.META_PIXEL_ID || '') ? process.env.META_PIXEL_ID : null,
    hubspot: scriptUrl(process.env.HUBSPOT_SCRIPT_URL, 'hubspot'),
    salesiq: scriptUrl(process.env.SALESIQ_WIDGET_URL, 'salesiq'),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
export const dynamic = 'force-dynamic';

function scriptUrl(value: string | undefined, provider: 'hubspot' | 'salesiq') {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    const valid = provider === 'hubspot'
      ? /^(js|js-na1|js-na2|js-eu1)\.hs-scripts\.com$/.test(url.hostname) && /^\/\d+\.js$/.test(url.pathname) && !url.search
      : /^salesiq\.zohopublic\.(com|eu|in|com\.au|ca|jp|com\.cn|sa)$/.test(url.hostname) && url.pathname === '/widget' && !!url.searchParams.get('wc');
    return valid ? url.href : null;
  } catch { return null; }
}

export function GET() {
  return Response.json({
    hubspot: scriptUrl(process.env.HUBSPOT_SCRIPT_URL, 'hubspot'),
    salesiq: scriptUrl(process.env.SALESIQ_WIDGET_URL, 'salesiq'),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
