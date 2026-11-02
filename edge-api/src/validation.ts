import { z } from 'zod';

function validUsPhone(value: string): boolean {
  if (!/^\+?[0-9().\s-]+$/.test(value)) return false;
  return /^(?:1)?[2-9][0-9]{2}[2-9][0-9]{6}$/.test(value.replace(/\D/g, ''));
}

const phone = z.string().trim().min(1).max(32).refine(validUsPhone, 'Enter a valid US phone number.');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid calendar date.');

const usStateCodes = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
  'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]);

export const callbackRequestSchema = z.object({
  request_kind: z.literal('callback'),
  service_code: z.string().trim().min(1).max(32).regex(/^[A-Z0-9-]+$/),
  address: z.object({
    region: z.string().trim().length(2).transform((value) => value.toUpperCase()).refine((value) => usStateCodes.has(value), 'Choose a valid US state.'),
    postal_code: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code.'),
  }).strict(),
  contact: z.object({
    name: z.string().trim().min(2, 'Enter your name.').max(150),
    phone,
    email: z.union([z.string().trim().email('Enter a valid email.').max(255), z.null()]).optional(),
  }).strict(),
  notes: z.string().trim().max(3000).optional().default(''),
  promotion_code: z.union([z.literal('FIRSTCLEAN10'), z.null()]).optional(),
}).strict();

export type CallbackRequest = z.infer<typeof callbackRequestSchema>;

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const optionalStateCode = z.string().trim().max(2).transform((value) => value.toUpperCase())
  .refine((value) => !value || usStateCodes.has(value), 'Choose a valid US state.').optional();

export const publicIntakeSchema = z.object({
  kind: z.enum(['discount', 'partner', 'referral', 'vendor']),
  website: z.string().max(0).optional(),
  email: z.string().trim().email('Enter a valid email.').max(255),
  name: optionalText(150),
  company: optionalText(255),
  phone: optionalText(32),
  city: optionalText(100),
  region: optionalStateCode,
  postal_code: z.union([z.string().trim().regex(/^\d{5}$/), z.literal('')]).optional(),
  zip_codes: z.union([z.string().trim().max(500).regex(/^\d{5}(\s*,\s*\d{5})*$/), z.literal('')]).optional(),
  team_size: z.coerce.number().int().min(1).max(1000).optional(),
  services: optionalText(2000),
  own_supplies: z.enum(['yes', 'no']).optional(),
  client_name: optionalText(150),
  client_phone: optionalText(32),
  client_email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
  service: optionalText(255),
  notes: optionalText(3000),
  marketing_email: z.boolean(),
  permission: z.boolean(),
}).strict().superRefine((value, context) => {
  const requireText = (key: keyof typeof value, message: string) => {
    if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
      context.addIssue({ code: 'custom', path: [key], message });
    }
  };
  if (value.kind !== 'discount') {
    requireText('name', 'Enter your name.');
    requireText('city', 'Enter a city.');
  }
  if (value.kind === 'partner') {
    requireText('phone', 'Enter a phone number.');
    requireText('region', 'Enter a state or region.');
    requireText('zip_codes', 'Enter at least one ZIP code.');
    requireText('services', 'Describe the services offered.');
    if (!value.team_size) context.addIssue({ code: 'custom', path: ['team_size'], message: 'Enter the team size.' });
    if (!value.own_supplies) context.addIssue({ code: 'custom', path: ['own_supplies'], message: 'Choose whether the team has supplies.' });
  }
  if (value.kind === 'vendor') {
    requireText('phone', 'Enter a phone number.');
    requireText('region', 'Enter a state or region.');
    requireText('postal_code', 'Enter a ZIP code.');
  }
  if (value.kind === 'referral') {
    requireText('postal_code', 'Enter a ZIP code.');
    requireText('client_name', 'Enter the client name.');
    requireText('service', 'Enter the requested service.');
    if (!value.permission || (!value.client_phone?.trim() && !value.client_email?.trim())) {
      context.addIssue({ code: 'custom', path: ['permission'], message: 'Client permission and a client phone number or email are required.' });
    }
  }
});

export type PublicIntake = z.infer<typeof publicIntakeSchema>;

const prospectServices = ['Cleaning', 'Deep cleaning', 'Office cleaning', 'Move-in/out cleaning', 'Junk removal', 'Pressure washing', 'Other'] as const;

export const prospectCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  segment: z.enum(['residential', 'commercial']),
  email: z.union([z.string().trim().email().max(255), z.literal('')]).optional().default(''),
  phone: z.union([z.string().trim().max(32).refine((value) => !value || validUsPhone(value), 'Enter a valid US phone number.'), z.literal('')]).optional().default(''),
  city: z.string().trim().max(255).optional().default(''),
  region: z.union([z.string().trim().regex(/^[A-Za-z]{2}$/), z.literal('')]).optional().default(''),
  source: z.string().trim().min(1).max(500),
  service_interest: z.enum(prospectServices),
  notes: z.string().trim().max(5000).optional().default(''),
}).strict().superRefine((value, context) => {
  if (!value.email && !value.phone) context.addIssue({ code: 'custom', path: ['email'], message: 'Include an email or phone number.' });
});

export const prospectUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'follow_up', 'interested', 'not_interested', 'do_not_contact']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  next_follow_up_at: z.string().nullable().optional(),
  assigned_agent_id: z.number().int().positive().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export const testInvoiceSchema = z.object({
  mode: z.enum(['deposit', 'full', 'balance']),
  days_until_due: z.number().int().min(1).max(90),
}).strict();

export const quoteIssueSchema = z.object({
  items: z.array(z.object({
    description: z.string().trim().min(1).max(255),
    quantity: z.number().int().min(1).max(9999),
    unit_cents: z.number().int().min(0).max(100_000_000),
  }).strict()).min(1).max(30),
  tax_cents: z.number().int().min(0).max(100_000_000),
  deposit_cents: z.number().int().min(0).max(100_000_000),
  expires_at: z.string().min(1).max(64),
}).strict();

export const bookingPrepareSchema = z.object({
  worker_id: z.number().int().positive(),
  start_at: z.string().min(1).max(64),
  end_at: z.string().min(1).max(64),
  time_zone: z.string().trim().min(1).max(100),
}).strict();

export const bookingTransitionSchema = z.object({
  action: z.enum(['start', 'submit_quality', 'complete', 'rework', 'cancel']),
  quality_confirmed: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional().default(''),
}).strict();

export const planChangeRequestSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
  reason: z.string().trim().max(1000).optional().default(''),
}).strict();

export const servicePlanCreateSchema = z.object({
  next_service_on: dateOnly.nullable().optional().default(null),
  customer_approved: z.literal(true),
}).strict();

export const planResolutionSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  next_service_on: dateOnly.nullable().optional().default(null),
}).strict();

export function normalizeUsPhone(value: string): string {
  if (!value) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  return `+${digits}`;
}

export function issueMap(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : 'request';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export function isIdempotencyKey(value: string | undefined): value is string {
  return Boolean(value && value.length >= 8 && value.length <= 120 && /^[\x21-\x7E]+$/.test(value));
}

export function isUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
