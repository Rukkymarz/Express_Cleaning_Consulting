import type { PublicIntake } from './validation';

export const discountEmailBody = [
  'Thanks for requesting your first-clean offer.',
  '',
  'Code: FIRSTCLEAN10',
  'Save 10% on your first completed cleaning, up to $30. New customers only. One offer per customer/property; cannot be combined. Excludes hauling/disposal fees, taxes, tips and add-ons. Local availability must be confirmed. Mention the code before approving your quote; our team confirms the discount in writing.',
  '',
  'Request a free quote: https://www.expresscleaningconsult.com/book?offer=FIRSTCLEAN10',
  'No card is required and no payment is taken by the quote form.',
  '',
  'This is the offer email you requested. For questions or email preferences, reply to support@expresscleaningconsult.com.',
].join('\n');

export function normalizeIntake(input: PublicIntake): Record<string, string | number | boolean> {
  const details: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'website' || value === undefined) continue;
    if (typeof value === 'string') details[key] = key === 'email' || key === 'client_email' ? value.trim().toLowerCase() : value.trim();
    else if (typeof value === 'number' || typeof value === 'boolean') details[key] = value;
  }
  return details;
}

export function canonicalJson(value: Record<string, string | number | boolean>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function staffIntakeBody(
  receipt: string,
  kind: string,
  details: Record<string, string | number | boolean>,
  reviewUrl: string,
): string {
  const lines = Object.entries(details).map(([key, value]) => {
    const rendered = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
    return `${key.replaceAll('_', ' ')}: ${rendered}`;
  });
  return [
    'A new website inquiry is ready for review.',
    `Reference: ${receipt}`,
    '',
    ...lines,
    '',
    `Review: ${reviewUrl}`,
    'Status: open',
  ].join('\n');
}
