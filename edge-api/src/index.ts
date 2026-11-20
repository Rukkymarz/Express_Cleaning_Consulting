import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ulid } from 'ulid';
import { proxyAuth, validatedSession } from './auth';
import { allowedOrigins, enabled, isEmail, isHttpsUrl, paymentsMode } from './config';
import { checkOpsToken, deliveryHealthBody } from './ops';
import { mailConfigurationError } from './mail';
import {
  acceptCustomerQuote,
  checkDatabase,
  assignStaffLead,
  convertStaffProspect,
  createStaffProspect,
  createStaffServicePlan,
  consumeRateLimit,
  createCallbackRequest,
  createPublicIntake,
  exportStaffLeads,
  getCatalog,
  getDeliveryHealth,
  getAccountContext,
  getAccountBooking,
  getAccountInvoice,
  getRequestStatus,
  getStaffAgents,
  getStaffApprovedWorkers,
  getStaffContext,
  holdStaffTestInvoiceForReconciliation,
  issueStaffQuote,
  linkStaffCustomer,
  listAccountBookings,
  listAccountInvoiceItems,
  listAccountPayments,
  listAccountPendingPlanChanges,
  listAccountPlans,
  listAccountQuotes,
  listStaffInquiries,
  listStaffLeads,
  listStaffProspects,
  prepareStaffTestInvoice,
  prepareStaffBooking,
  processResendEvent,
  processStripeEvent,
  recordStaffTestInvoice,
  requestAccountPlanChange,
  resolveStaffPlanChange,
  transitionStaffBooking,
  updateStaffInquiry,
  updateStaffLead,
  updateStaffProspect,
  updateStaffTask,
  type AccountBooking,
  type StaffLead,
  type StaffProspect,
} from './db';
import { canonicalJson, discountEmailBody, normalizeIntake, sha256Hex, staffIntakeBody } from './intake';
import { renderCsv } from './csv';
import { processOutboxes, runScheduledMaintenance } from './outbox';
import { buildInvoicePdf } from './pdf';
import { parseResendEmailEvent, verifyResendWebhook } from './resend-webhook';
import { createStripeTestInvoice, isStripeTestApiKey } from './stripe-api';
import { parseStripeEvent, verifyStripeSignature } from './stripe';
import type { Env } from './types';
import {
  callbackRequestSchema,
  bookingPrepareSchema,
  bookingTransitionSchema,
  customerLinkSchema,
  isIdempotencyKey,
  isUlid,
  issueMap,
  normalizeUsPhone,
  planChangeRequestSchema,
  planResolutionSchema,
  prospectCreateSchema,
  prospectUpdateSchema,
  publicIntakeSchema,
  quoteIssueSchema,
  servicePlanCreateSchema,
  testInvoiceSchema,
} from './validation';

type Bindings = { Bindings: Env };
const app = new Hono<Bindings>();
const encoder = new TextEncoder();

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function requireTrustedBrowserMutation(c: Context<Bindings>): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return;
  const origin = c.req.header('Origin');
  if (!origin || !allowedOrigins(c.env.CORS_ALLOWED_ORIGINS).has(origin)) {
    throw new HTTPException(403, { message: 'A trusted website session is required for this action.' });
  }
}

async function accountIdentity(c: Context<Bindings>): Promise<{ authUserId: string }> {
  requireTrustedBrowserMutation(c);
  const session = await validatedSession(c.req.raw, c.env);
  if (!session) throw new HTTPException(401, { message: 'Please sign in.' });
  return { authUserId: session.user.id };
}

async function staffIdentity(c: Context<Bindings>): Promise<{ authUserId: string }> {
  const { authUserId } = await accountIdentity(c);
  try {
    const context = await getStaffContext(c.env, authUserId);
    if (!context) throw new HTTPException(403, { message: 'Your account does not have staff access.' });
    return { authUserId };
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    if (error instanceof Error && error.message.includes('Staff permission denied')) {
      throw new HTTPException(403, { message: 'Your account does not have permission to use this feature.' });
    }
    throw error;
  }
}

function positiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function cursorFor(lead: StaffLead): string {
  const value = btoa(JSON.stringify([Number(lead.lead_score), String(lead.id)]));
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseLeadCursor(value: string | undefined): { score: number; id: number } | null {
  if (!value) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(base64)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const score = Number(parsed[0]);
    const id = Number(parsed[1]);
    return Number.isInteger(score) && score >= 0 && score <= 255 && Number.isSafeInteger(id) && id > 0 ? { score, id } : null;
  } catch { return null; }
}

function prospectCursorFor(prospect: StaffProspect): string {
  const value = btoa(JSON.stringify([Number(prospect.territory_priority), String(prospect.id)]));
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseProspectCursor(value: string | undefined): { priority: number; id: number } | null {
  if (!value) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(base64)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const priority = Number(parsed[0]);
    const id = Number(parsed[1]);
    return Number.isInteger(priority) && priority >= 0 && priority <= 2 && Number.isSafeInteger(id) && id > 0 ? { priority, id } : null;
  } catch { return null; }
}

function accountCursorFor(booking: AccountBooking): string {
  const value = btoa(JSON.stringify([String(booking.internal_id)]));
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseAccountCursor(value: string | undefined): number | null {
  if (!value || value.length > 128) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(base64)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 1) return null;
    const id = Number(parsed[0]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}

function staffDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  const firstLine = message.split('\n')[0]?.trim() || '';
  if (lower.includes('account link required')) throw new HTTPException(403, { message: 'This sign-in is not linked to an application account.' });
  if (lower.includes('staff permission denied')) throw new HTTPException(403, { message: 'Your account does not have permission to use this feature.' });
  if (lower.includes('not found')) throw new HTTPException(404, { message: 'The requested record was not found.' });
  if (lower.includes('idempotency key reused') || lower.includes('another test payment option')
      || lower.includes('prior stripe result is ambiguous') || lower.includes('quote must be accepted')
      || lower.includes('booking is not ready') || lower.includes('balance is available')
      || lower.includes('payment already received') || lower.includes('accepted quote already exists')
      || lower.includes('different quote') || lower.includes('quote unavailable')
      || lower.includes('another quote is already accepted') || lower.includes('booking already exists')
      || lower.includes('worker is not approved') || lower.includes('worker is already assigned')
      || lower.includes('customer account must be verified') || lower.includes('quote must be accepted before booking')
      || lower.includes('verified invited customer account') || lower.includes('different customer account')
      || lower.includes('transition is not allowed') || lower.includes('a plan change is already pending')
      || lower.includes('this change is unavailable') || lower.includes('a completed recurring service')
      || lower.includes('plan state changed') || lower.includes('already resolved differently')) {
    throw new HTTPException(409, { message: firstLine || 'The requested action conflicts with the current record state.' });
  }
  if (lower.includes('invalid') || lower.includes('nothing to update') || lower.includes('approved sales agent')
      || lower.includes('already in lead generation') || lower.includes('mark the prospect interested')
      || lower.includes('moved to the lead pipeline') || lower.includes('verified customer email')
      || lower.includes('no approved amount') || lower.includes('invalid quote')
      || lower.includes('invalid booking') || lower.includes('quality review must be confirmed')
      || lower.includes('customer account email must match') || lower.includes('enter the verified customer account email')
      || lower.includes('invalid plan change') || lower.includes('invalid recurring plan')
      || lower.includes('invalid plan resolution') || lower.includes('declined change cannot set')) {
    throw new HTTPException(422, { message: firstLine || 'The update is invalid.' });
  }
  throw error;
}

async function bodyText(c: Context<Bindings>, maximumBytes: number): Promise<string> {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maximumBytes) throw new HTTPException(413, { message: 'Request body is too large.' });
  const raw = await c.req.raw.text();
  if (encoder.encode(raw).byteLength > maximumBytes) throw new HTTPException(413, { message: 'Request body is too large.' });
  return raw;
}

async function bucketKey(env: Env, c: Context<Bindings>, route: string): Promise<string> {
  if (!env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length < 24) throw new HTTPException(503, { message: 'Request protection is not configured.' });
  const forwarded = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const input = encoder.encode(`${env.RATE_LIMIT_SALT}:${route}:${forwarded}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function enforceRateLimit(
  env: Env,
  c: Context<Bindings>,
  route: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const result = await consumeRateLimit(env, await bucketKey(env, c, route), limit, windowSeconds);
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(result.remaining));
  if (result.allowed) return null;
  c.header('Retry-After', String(result.retry_after_seconds));
  return c.json({ message: 'Too many requests were sent. Please wait a minute and try again.' }, 429);
}

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const origins = allowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
  if (origin && !origins.has(origin)) return c.json({ message: 'Origin is not allowed.' }, 403);

  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Accept, Content-Type, Idempotency-Key, Stripe-Signature, Authorization');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    c.header('Access-Control-Max-Age', '600');
  }
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});

app.get('/', (c) => c.json({ service: 'Express Cleaning Consult Edge API' }));

app.get('/up', async (c) => {
  try {
    await checkDatabase(c.env);
    return c.json({ service: 'ok', database: 'ok' });
  } catch (error) {
    console.error('Health check failed.', { error: safeErrorName(error) });
    return c.json({ service: 'degraded', database: 'unavailable' }, 503);
  }
});

app.all('/api/v1/auth/*', async (c) => {
  requireTrustedBrowserMutation(c);
  const path = (c.req.param('*') ?? '').replace(/^\/+/, '');
  if (c.req.method === 'POST' && /^sign-up(?:\/|$)/.test(path)) {
    return c.json({ message: 'Account registration is invitation-only.' }, 403);
  }
  const limited = await enforceRateLimit(c.env, c, 'authentication', 30, 60);
  if (limited) return limited;
  return proxyAuth(c.req.raw, c.env, path);
});

app.get('/api/v1/session', async (c) => {
  const { authUserId } = await accountIdentity(c);
  try {
    const context = await getAccountContext(c.env, authUserId);
    if (!context) throw new HTTPException(403, { message: 'This sign-in is not linked to an application account.' });
    return c.json({
      authenticated: true,
      name: context.name,
      email: context.email,
      staff: context.is_staff,
      permissions: context.permissions,
      redirect_to: context.is_staff ? '/admin' : '/account',
    });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/bookings', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const cursorValue = c.req.query('cursor');
  const cursorId = parseAccountCursor(cursorValue);
  if (cursorValue && !cursorId) return c.json({ message: 'Page cursor is invalid.' }, 422);
  try {
    const rows = await listAccountBookings(c.env, authUserId, cursorId, 21);
    const hasMore = rows.length > 20;
    const page = rows.slice(0, 20);
    return c.json({
      data: page.map(({ internal_id: _internalId, ...booking }) => ({
        ...booking,
        balance_due_cents: Number(booking.balance_due_cents),
      })),
      next_cursor: hasMore && page.length ? accountCursorFor(page[page.length - 1] as AccountBooking) : null,
    });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/quotes', async (c) => {
  const { authUserId } = await accountIdentity(c);
  try {
    const rows = await listAccountQuotes(c.env, authUserId);
    return c.json({
      data: rows.map(({ quote_id: publicId, items: rawItems, ...quote }) => {
        const parsedItems = typeof rawItems === 'string' ? JSON.parse(rawItems) as unknown : rawItems;
        const items = Array.isArray(parsedItems) ? parsedItems.map((raw) => {
          const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
          return {
            description: typeof item.description === 'string' ? item.description : '',
            quantity: Number(item.quantity ?? 0),
            unit_cents: Number(item.unit_cents ?? 0),
            total_cents: Number(item.total_cents ?? 0),
          };
        }) : [];
        return {
          ...quote,
          public_id: publicId,
          revision: Number(quote.revision),
          subtotal_cents: Number(quote.subtotal_cents),
          tax_cents: Number(quote.tax_cents),
          total_cents: Number(quote.total_cents),
          deposit_cents: Number(quote.deposit_cents),
          items,
        };
      }),
    });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/bookings/:publicId/payments', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const publicId = c.req.param('publicId').toUpperCase();
  if (!isUlid(publicId)) return c.json({ message: 'Booking receipt is invalid.' }, 422);
  try {
    const payments = await listAccountPayments(c.env, authUserId, publicId);
    return c.json(payments.map((payment) => ({ ...payment, amount_cents: Number(payment.amount_cents) })));
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/bookings/:publicId/invoice.pdf', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const publicId = c.req.param('publicId').toUpperCase();
  if (!isUlid(publicId)) return c.json({ message: 'Booking receipt is invalid.' }, 422);
  try {
    const [invoice, items] = await Promise.all([
      getAccountInvoice(c.env, authUserId, publicId),
      listAccountInvoiceItems(c.env, authUserId, publicId),
    ]);
    if (!invoice) return c.json({ message: 'Invoice not found.' }, 404);
    const pdf = buildInvoicePdf(invoice, items);
    const filename = invoice.invoice_number.replace(/[^A-Za-z0-9_-]/g, '') || 'invoice';
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/bookings/:publicId', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const publicId = c.req.param('publicId').toUpperCase();
  if (!isUlid(publicId)) return c.json({ message: 'Booking receipt is invalid.' }, 422);
  try {
    const booking = await getAccountBooking(c.env, authUserId, publicId);
    if (!booking) return c.json({ message: 'Booking not found.' }, 404);
    return c.json({
      ...booking,
      total_cents: Number(booking.total_cents),
      deposit_cents: Number(booking.deposit_cents),
      balance_due_cents: Number(booking.balance_due_cents),
    });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/account/plans', async (c) => {
  const { authUserId } = await accountIdentity(c);
  try {
    const [plans, pending] = await Promise.all([
      listAccountPlans(c.env, authUserId),
      listAccountPendingPlanChanges(c.env, authUserId),
    ]);
    return c.json({
      plans: plans.map((plan) => ({ ...plan, id: Number(plan.id) })),
      pending_requests: pending.map((request) => ({
        ...request,
        service_plan_id: Number(request.service_plan_id),
      })),
    });
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/account/plans/:publicId/change-requests', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const publicId = c.req.param('publicId').toUpperCase();
  if (!isUlid(publicId)) return c.json({ message: 'Service plan receipt is invalid.' }, 422);
  const raw = await bodyText(c, 4_096);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = planChangeRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the plan change request.', errors: issueMap(parsed.error) }, 422);
  try {
    const result = await requestAccountPlanChange(
      c.env, authUserId, publicId, parsed.data.action, parsed.data.reason,
    );
    return c.json({ request_id: Number(result.request_id), status: result.status }, result.created ? 202 : 200);
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/agents', async (c) => {
  const { authUserId } = await staffIdentity(c);
  try {
    const agents = await getStaffAgents(c.env, authUserId);
    return c.json(agents.map((agent) => ({ ...agent, id: Number(agent.id) })));
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/workers', async (c) => {
  const { authUserId } = await staffIdentity(c);
  try {
    const workers = await getStaffApprovedWorkers(c.env, authUserId);
    return c.json(workers.map((worker) => ({ ...worker, id: Number(worker.id) })));
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/leads', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const stage = c.req.query('stage')?.trim() || null;
  const agentValue = c.req.query('agent_id');
  const agentId = agentValue ? positiveInteger(agentValue) : null;
  if (agentValue && !agentId) return c.json({ message: 'Agent filter is invalid.' }, 422);
  const search = c.req.query('search')?.trim() || null;
  if (search && search.length > 100) return c.json({ message: 'Search is too long.' }, 422);
  const cursorValue = c.req.query('cursor');
  const cursor = parseLeadCursor(cursorValue);
  if (cursorValue && !cursor) return c.json({ message: 'Page cursor is invalid.' }, 422);

  try {
    const rows = await listStaffLeads(c.env, authUserId, {
      stage,
      agentId,
      unassigned: ['1', 'true'].includes(c.req.query('unassigned') ?? ''),
      search,
      cursorScore: cursor?.score ?? null,
      cursorId: cursor?.id ?? null,
      limit: 26,
    });
    const hasMore = rows.length > 25;
    const page = rows.slice(0, 25);
    const normalized = page.map((lead) => ({
      ...lead,
      id: Number(lead.id),
      lead_score: Number(lead.lead_score),
      assigned_agent_id: lead.assigned_agent_id === null ? null : Number(lead.assigned_agent_id),
      service_request_id: lead.service_request_id === null ? null : Number(lead.service_request_id),
      customer_id: lead.customer_id === null ? null : Number(lead.customer_id),
      quote_total_cents: lead.quote_total_cents === null ? null : Number(lead.quote_total_cents),
      quote_deposit_cents: lead.quote_deposit_cents === null ? null : Number(lead.quote_deposit_cents),
    }));
    return c.json({ data: normalized, next_cursor: hasMore && page.length ? cursorFor(page[page.length - 1] as StaffLead) : null });
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/leads.csv', async (c) => {
  const { authUserId } = await staffIdentity(c);
  try {
    const rows = await exportStaffLeads(c.env, authUserId);
    const csv = renderCsv(
      [
        'Receipt', 'Name', 'Email', 'Phone', 'Lead status', 'Pipeline stage',
        'Lead score', 'Assigned agent', 'Next follow-up', 'Service', 'Street',
        'Unit', 'City', 'State', 'ZIP', 'Task status', 'Notification status', 'Created',
      ],
      rows.map((row) => [
        row.receipt, row.name, row.email, row.phone, row.lead_status,
        row.pipeline_stage, row.lead_score, row.assigned_agent,
        row.next_follow_up_at, row.service_name, row.street, row.unit, row.city,
        row.region, row.postal_code, row.task_status, row.notification_status,
        row.created_at,
      ]),
    );
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="express-cleaning-leads-${date}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { staffDatabaseError(error); }
});

app.patch('/api/v1/admin/leads/:leadId', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const leadId = positiveInteger(c.req.param('leadId'));
  if (!leadId) return c.json({ message: 'Lead ID is invalid.' }, 422);
  const raw = await bodyText(c, 8_192);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ message: 'Update is invalid.' }, 422);
  const record = body as Record<string, unknown>;
  const status = record.status === undefined ? null : typeof record.status === 'string' ? record.status : '__invalid__';
  const setFollowUp = Object.prototype.hasOwnProperty.call(record, 'next_follow_up_at');
  let followUp: string | null = null;
  if (setFollowUp && record.next_follow_up_at !== null) {
    if (typeof record.next_follow_up_at !== 'string' || Number.isNaN(Date.parse(record.next_follow_up_at))) {
      return c.json({ message: 'Follow-up date is invalid.' }, 422);
    }
    followUp = new Date(record.next_follow_up_at).toISOString();
  }
  try {
    await updateStaffLead(c.env, authUserId, leadId, { status, nextFollowUpAt: followUp, setFollowUp });
    return c.body(null, 204);
  } catch (error) { staffDatabaseError(error); }
});

app.patch('/api/v1/admin/leads/:leadId/assignment', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const leadId = positiveInteger(c.req.param('leadId'));
  if (!leadId) return c.json({ message: 'Lead ID is invalid.' }, 422);
  const raw = await bodyText(c, 2_048);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const agentId = body && typeof body === 'object' ? positiveInteger(String((body as Record<string, unknown>).agent_id ?? '')) : null;
  if (!agentId) return c.json({ message: 'Choose an approved sales agent.' }, 422);
  try {
    await assignStaffLead(c.env, authUserId, leadId, agentId);
    return c.json({ agent_id: agentId });
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/leads/:leadId/customer-link', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const leadId = positiveInteger(c.req.param('leadId'));
  if (!leadId) return c.json({ message: 'Lead ID is invalid.' }, 422);
  const raw = await bodyText(c, 2_048);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = customerLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Enter the verified invited customer email.', errors: issueMap(parsed.error) }, 422);
  }
  try {
    const customer = await linkStaffCustomer(c.env, authUserId, leadId, parsed.data.email.toLowerCase());
    return c.json({
      customer_id: Number(customer.customer_id),
      customer_email: customer.customer_email,
      linked: customer.linked,
    }, customer.linked ? 201 : 200);
  } catch (error) { staffDatabaseError(error); }
});

app.patch('/api/v1/admin/tasks/:taskId', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const taskId = c.req.param('taskId').toUpperCase();
  if (!isUlid(taskId)) return c.json({ message: 'Task ID is invalid.' }, 422);
  const raw = await bodyText(c, 2_048);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const status = body && typeof body === 'object' ? (body as Record<string, unknown>).status : null;
  if (typeof status !== 'string' || !['open', 'in_progress', 'completed'].includes(status)) {
    return c.json({ message: 'Task status is invalid.' }, 422);
  }
  try { return c.json(await updateStaffTask(c.env, authUserId, taskId, status)); }
  catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/inquiries', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const kind = c.req.query('kind')?.trim() || null;
  const page = Number(c.req.query('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1) return c.json({ message: 'Page is invalid.' }, 422);
  try {
    const rows = await listStaffInquiries(c.env, authUserId, kind, page, 30);
    const total = rows.length ? Number(rows[0]?.total_count ?? 0) : 0;
    return c.json({
      data: rows.map(({ total_count: _total, ...row }) => row),
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / 30)),
      total,
    });
  } catch (error) { staffDatabaseError(error); }
});

app.patch('/api/v1/admin/inquiries/:publicId', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const publicId = c.req.param('publicId').toUpperCase();
  if (!isUlid(publicId)) return c.json({ message: 'Inquiry ID is invalid.' }, 422);
  const raw = await bodyText(c, 2_048);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const status = body && typeof body === 'object' ? (body as Record<string, unknown>).status : null;
  if (typeof status !== 'string' || !['open', 'in_progress', 'completed'].includes(status)) {
    return c.json({ message: 'Inquiry status is invalid.' }, 422);
  }
  try {
    await updateStaffInquiry(c.env, authUserId, publicId, status);
    return c.body(null, 204);
  } catch (error) { staffDatabaseError(error); }
});

app.get('/api/v1/admin/prospects', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const segment = c.req.query('segment')?.trim() || null;
  const queue = c.req.query('queue')?.trim() || 'all';
  const region = c.req.query('region')?.trim().toUpperCase() || null;
  const search = c.req.query('search')?.trim() || null;
  if (search && search.length > 100) return c.json({ message: 'Search is too long.' }, 422);
  let before: string | null = null;
  if (c.req.query('before')) {
    const value = c.req.query('before') as string;
    if (Number.isNaN(Date.parse(value))) return c.json({ message: 'Due date is invalid.' }, 422);
    before = new Date(value).toISOString();
  }
  const cursorValue = c.req.query('cursor');
  const cursor = parseProspectCursor(cursorValue);
  if (cursorValue && !cursor) return c.json({ message: 'Page cursor is invalid.' }, 422);
  try {
    const rows = await listStaffProspects(c.env, authUserId, {
      segment, queue, before, region, search,
      cursorPriority: cursor?.priority ?? null,
      cursorId: cursor?.id ?? null,
      limit: 26,
    });
    const hasMore = rows.length > 25;
    const page = rows.slice(0, 25);
    return c.json({
      data: page.map((prospect) => ({
        ...prospect,
        id: Number(prospect.id),
        assigned_agent_id: prospect.assigned_agent_id === null ? null : Number(prospect.assigned_agent_id),
      })),
      next_cursor: hasMore && page.length ? prospectCursorFor(page[page.length - 1] as StaffProspect) : null,
    });
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/prospects', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const raw = await bodyText(c, 16_384);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = prospectCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the prospect details.', errors: issueMap(parsed.error) }, 422);
  try {
    const id = await createStaffProspect(c.env, authUserId, {
      name: parsed.data.name,
      segment: parsed.data.segment,
      email: parsed.data.email.toLowerCase(),
      phone: normalizeUsPhone(parsed.data.phone),
      city: parsed.data.city,
      region: parsed.data.region.toUpperCase(),
      source: parsed.data.source,
      serviceInterest: parsed.data.service_interest,
      notes: parsed.data.notes,
    });
    return c.json({ id }, 201);
  } catch (error) { staffDatabaseError(error); }
});

app.patch('/api/v1/admin/prospects/:prospectId', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const prospectId = positiveInteger(c.req.param('prospectId'));
  if (!prospectId) return c.json({ message: 'Prospect ID is invalid.' }, 422);
  const raw = await bodyText(c, 16_384);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = prospectUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the prospect update.', errors: issueMap(parsed.error) }, 422);
  let followUp: string | null = null;
  if (parsed.data.next_follow_up_at !== undefined && parsed.data.next_follow_up_at !== null) {
    if (Number.isNaN(Date.parse(parsed.data.next_follow_up_at))) return c.json({ message: 'Follow-up date is invalid.' }, 422);
    followUp = new Date(parsed.data.next_follow_up_at).toISOString();
  }
  try {
    await updateStaffProspect(c.env, authUserId, prospectId, {
      status: parsed.data.status ?? null,
      notes: parsed.data.notes ?? null,
      setNotes: Object.prototype.hasOwnProperty.call(parsed.data, 'notes'),
      nextFollowUpAt: followUp,
      setFollowUp: Object.prototype.hasOwnProperty.call(parsed.data, 'next_follow_up_at'),
      assignedAgentId: parsed.data.assigned_agent_id ?? null,
      setAssignedAgent: Object.prototype.hasOwnProperty.call(parsed.data, 'assigned_agent_id'),
    });
    return c.body(null, 204);
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/prospects/:prospectId/convert', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const prospectId = positiveInteger(c.req.param('prospectId'));
  if (!prospectId) return c.json({ message: 'Prospect ID is invalid.' }, 422);
  try {
    const leadId = await convertStaffProspect(c.env, authUserId, prospectId, ulid());
    return c.json({ lead_id: leadId });
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/requests/:serviceRequestId/quotes', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const serviceRequestId = positiveInteger(c.req.param('serviceRequestId'));
  if (!serviceRequestId) return c.json({ message: 'Service request ID is invalid.' }, 422);
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!isIdempotencyKey(idempotencyKey)) {
    return c.json({ message: 'Idempotency-Key must contain 8 to 120 visible characters.' }, 422);
  }
  const raw = await bodyText(c, 65_536);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = quoteIssueSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the quote details.', errors: issueMap(parsed.error) }, 422);
  const expiresAt = new Date(parsed.data.expires_at);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt.valueOf() <= Date.now()) {
    return c.json({ message: 'Quote expiration must be in the future.' }, 422);
  }
  const subtotal = parsed.data.items.reduce((sum, item) => sum + item.quantity * item.unit_cents, 0);
  const total = subtotal + parsed.data.tax_cents;
  if (!Number.isSafeInteger(total) || total < 50 || parsed.data.deposit_cents > total) {
    return c.json({ message: 'Quote amount is invalid.' }, 422);
  }
  try {
    const quote = await issueStaffQuote(c.env, authUserId, serviceRequestId, ulid(), idempotencyKey, {
      ...parsed.data,
      expires_at: expiresAt.toISOString(),
    });
    return c.json({
      quote_id: quote.quote_id,
      revision: Number(quote.revision),
      total_cents: Number(quote.total_cents),
      deposit_cents: Number(quote.deposit_cents),
      status: quote.status,
    }, quote.created ? 201 : 200);
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/quotes/:quoteId/accept', async (c) => {
  const { authUserId } = await accountIdentity(c);
  const quoteId = c.req.param('quoteId').toUpperCase();
  if (!isUlid(quoteId)) return c.json({ message: 'Quote receipt is invalid.' }, 422);
  try { return c.json(await acceptCustomerQuote(c.env, authUserId, quoteId)); }
  catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/quotes/:quoteId/booking', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const quoteId = c.req.param('quoteId').toUpperCase();
  if (!isUlid(quoteId)) return c.json({ message: 'Quote receipt is invalid.' }, 422);
  const raw = await bodyText(c, 8_192);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = bookingPrepareSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the booking details.', errors: issueMap(parsed.error) }, 422);
  const startAt = new Date(parsed.data.start_at);
  const endAt = new Date(parsed.data.end_at);
  if (Number.isNaN(startAt.valueOf()) || Number.isNaN(endAt.valueOf())
      || startAt.valueOf() <= Date.now() || endAt.valueOf() <= startAt.valueOf()) {
    return c.json({ message: 'Booking window is invalid.' }, 422);
  }
  try {
    const booking = await prepareStaffBooking(c.env, authUserId, {
      quotePublicId: quoteId,
      workerId: parsed.data.worker_id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timeZone: parsed.data.time_zone,
      bookingPublicId: ulid(),
      invoicePublicId: ulid(),
    });
    return c.json({ booking_id: booking.booking_id, status: booking.status }, booking.created ? 201 : 200);
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/bookings/:bookingId/transition', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const bookingId = positiveInteger(c.req.param('bookingId'));
  if (!bookingId) return c.json({ message: 'Booking ID is invalid.' }, 422);
  const raw = await bodyText(c, 8_192);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = bookingTransitionSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the booking transition.', errors: issueMap(parsed.error) }, 422);
  try {
    return c.json(await transitionStaffBooking(c.env, authUserId, bookingId, {
      action: parsed.data.action,
      qualityConfirmed: parsed.data.quality_confirmed,
      notes: parsed.data.notes,
    }));
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/bookings/:bookingId/plan', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const bookingId = positiveInteger(c.req.param('bookingId'));
  if (!bookingId) return c.json({ message: 'Booking ID is invalid.' }, 422);
  const raw = await bodyText(c, 4_096);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = servicePlanCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the recurring plan details.', errors: issueMap(parsed.error) }, 422);
  try {
    const plan = await createStaffServicePlan(c.env, authUserId, bookingId, ulid(), parsed.data.next_service_on);
    return c.json({ plan_id: plan.plan_id, status: plan.status }, plan.created ? 201 : 200);
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/plan-requests/:changeId/resolve', async (c) => {
  const { authUserId } = await staffIdentity(c);
  const changeId = positiveInteger(c.req.param('changeId'));
  if (!changeId) return c.json({ message: 'Plan change request ID is invalid.' }, 422);
  const raw = await bodyText(c, 4_096);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = planResolutionSchema.safeParse(body);
  if (!parsed.success) return c.json({ message: 'Please review the plan decision.', errors: issueMap(parsed.error) }, 422);
  try {
    const result = await resolveStaffPlanChange(
      c.env, authUserId, changeId, parsed.data.decision, parsed.data.next_service_on,
    );
    return c.json({
      request_id: Number(result.request_id),
      status: result.status,
      plan_status: result.plan_status,
    });
  } catch (error) { staffDatabaseError(error); }
});

app.post('/api/v1/admin/bookings/:bookingId/payment-invoices', async (c) => {
  const { authUserId } = await staffIdentity(c);
  if (paymentsMode(c.env.STRIPE_PAYMENTS_MODE) !== 'test' || !isStripeTestApiKey(c.env.STRIPE_API_KEY)) {
    return c.json({ message: 'Test-mode Stripe invoicing is not configured.' }, 503);
  }

  const bookingId = c.req.param('bookingId').toUpperCase();
  if (!isUlid(bookingId)) return c.json({ message: 'Booking ID is invalid.' }, 422);
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!isIdempotencyKey(idempotencyKey)) {
    return c.json({ message: 'Idempotency-Key must contain 8 to 120 visible characters.' }, 422);
  }

  const raw = await bodyText(c, 2_048);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = testInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ message: 'Choose the approved amount and an invoice due date.', errors: issueMap(parsed.error) }, 422);
  }

  const prepared = await prepareStaffTestInvoice(
    c.env,
    authUserId,
    bookingId,
    parsed.data.mode,
    parsed.data.days_until_due,
    idempotencyKey,
  ).catch((error) => staffDatabaseError(error));
  const paymentId = Number(prepared.payment_id);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) throw new Error('Test invoice workflow returned an invalid payment ID.');

  const response = {
    payment_id: paymentId,
    status: prepared.payment_status,
    amount_cents: Number(prepared.amount_cents),
    currency: prepared.currency,
    hosted_invoice_url: prepared.hosted_invoice_url,
    test_mode: true,
  };
  if (prepared.stripe_invoice_id) return c.json(response);

  try {
    const invoice = await createStripeTestInvoice(c.env, prepared);
    await recordStaffTestInvoice(c.env, authUserId, prepared.payment_id, invoice);
    return c.json({
      ...response,
      status: 'invoice_open',
      hosted_invoice_url: invoice.hostedInvoiceUrl,
    }, 201);
  } catch (error) {
    console.error('Stripe test invoice result was not confirmed.', {
      error: safeErrorName(error),
      paymentId,
    });
    try {
      await holdStaffTestInvoiceForReconciliation(c.env, authUserId, prepared.payment_id);
    } catch (holdError) {
      console.error('Unable to persist the Stripe reconciliation hold.', {
        error: safeErrorName(holdError),
        paymentId,
      });
    }
    return c.json({
      message: 'Stripe did not confirm the test invoice result. Staff must reconcile it before retrying.',
      payment_id: paymentId,
      test_mode: true,
    }, 502);
  }
});

app.get('/api/v1/catalog', async (c) => {
  const limited = await enforceRateLimit(c.env, c, 'catalog', 60, 60);
  if (limited) return limited;
  return c.json(await getCatalog(c.env));
});

app.get('/api/v1/requests/:requestId/status', async (c) => {
  const limited = await enforceRateLimit(c.env, c, 'request-status', 30, 60);
  if (limited) return limited;
  const requestId = c.req.param('requestId').toUpperCase();
  if (!isUlid(requestId)) return c.json({ message: 'Request receipt is invalid.' }, 422);
  const status = await getRequestStatus(c.env, requestId);
  return status ? c.json(status) : c.json({ message: 'Request not found.' }, 404);
});

app.post('/api/v1/public-intakes', async (c) => {
  const limited = await enforceRateLimit(c.env, c, 'public-intake', 5, 60);
  if (limited) return limited;

  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!isIdempotencyKey(idempotencyKey)) {
    return c.json({ message: 'Idempotency-Key must contain 8 to 120 visible characters.' }, 422);
  }

  const raw = await bodyText(c, 16_384);
  let candidate: unknown;
  try { candidate = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = publicIntakeSchema.safeParse(candidate);
  if (!parsed.success) return c.json({ message: 'Please review your information and try again.', errors: issueMap(parsed.error) }, 422);
  if (!isEmail(c.env.QUOTE_NOTIFICATION_TO)) return c.json({ message: 'The inquiry workflow is not configured.' }, 503);
  if (!isHttpsUrl(c.env.STAFF_REVIEW_URL)) return c.json({ message: 'The staff review workflow is not configured.' }, 503);

  const publicId = ulid();
  const details = normalizeIntake(parsed.data);
  const reviewUrl = new URL('/admin/inquiries', c.env.STAFF_REVIEW_URL).toString();
  try {
    const result = await createPublicIntake(c.env, {
      requestKey: idempotencyKey,
      publicId,
      kind: parsed.data.kind,
      payloadHash: await sha256Hex(canonicalJson(details)),
      name: typeof details.name === 'string' ? details.name : '',
      email: String(details.email),
      details,
      marketingEmail: parsed.data.marketing_email,
      staffTo: c.env.QUOTE_NOTIFICATION_TO,
      staffBody: staffIntakeBody(publicId, parsed.data.kind, details, reviewUrl),
      discountBody: parsed.data.kind === 'discount' ? discountEmailBody : '',
    });
    try { c.executionCtx.waitUntil(processOutboxes(c.env, 2)); } catch { /* Scheduled delivery remains durable. */ }
    return c.json({
      receipt: result.receipt,
      status: 'received',
      offer_code: parsed.data.kind === 'discount' ? 'FIRSTCLEAN10' : null,
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('already used for different details')) return c.json({ message }, 409);
    console.error('Public intake persistence failed.', { error: safeErrorName(error) });
    return c.json({ message: 'We could not save this request right now. Please try again shortly.' }, 503);
  }
});

app.post('/api/v1/requests', async (c) => {
  const limited = await enforceRateLimit(c.env, c, 'quote-request', 10, 60);
  if (limited) return limited;

  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!isIdempotencyKey(idempotencyKey)) {
    return c.json({ message: 'Idempotency-Key must contain 8 to 120 visible characters.' }, 422);
  }

  const raw = await bodyText(c, 16_384);
  let candidate: unknown;
  try { candidate = JSON.parse(raw); } catch { return c.json({ message: 'Request body must be valid JSON.' }, 400); }
  const parsed = callbackRequestSchema.safeParse(candidate);
  if (!parsed.success) return c.json({ message: 'Please review your information and try again.', errors: issueMap(parsed.error) }, 422);

  const reviewUrl = c.env.STAFF_REVIEW_URL;
  if (!isHttpsUrl(reviewUrl)) return c.json({ message: 'The staff review workflow is not configured.' }, 503);

  try {
    const result = await createCallbackRequest(
      c.env,
      parsed.data,
      { request: ulid(), lead: ulid(), task: ulid() },
      idempotencyKey,
      reviewUrl,
    );

    try { c.executionCtx.waitUntil(processOutboxes(c.env, 1)); } catch { /* Scheduled delivery remains durable. */ }
    return c.json({
      request_id: result.request_id,
      status: 'received',
      next_step: 'scope_review',
      workflow: {
        task_status: result.task_status,
        notification_status: result.notification_status,
      },
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Idempotency-Key was already used for a different quote request')) {
      return c.json({ message: 'This request retry key was already used for different details. Refresh before sending a new request.' }, 409);
    }
    if (message.includes('Service unavailable for requests')) {
      return c.json({ message: 'That service is not currently available for quote requests.' }, 422);
    }
    console.error('Quote request persistence failed.', { error: safeErrorName(error) });
    return c.json({ message: 'We could not save your request right now. Please retry, or call (281) 972-7712. Retrying with the same request will not create a duplicate.' }, 503);
  }
});

app.get('/api/v1/ops/delivery-health', async (c) => {
  // A01: machine monitor endpoint. Bearer token only; aggregate counts only.
  const auth = checkOpsToken(c.req.header('Authorization'), c.env.OPS_HEALTH_TOKEN);
  if (auth === 'unconfigured') return c.json({ message: 'Operator health monitoring is not configured.' }, 503);
  if (auth === 'unauthorized') return c.json({ message: 'Unauthorized.' }, 401);
  const limited = await enforceRateLimit(c.env, c, 'ops-health', 30, 60);
  if (limited) return limited;
  try {
    const row = await getDeliveryHealth(c.env, 30);
    return c.json(deliveryHealthBody(row, mailConfigurationError(c.env) ?? null));
  } catch (error) {
    console.error('Delivery health query failed.', { error: safeErrorName(error) });
    return c.json({ schema: 'ecc.delivery-health.v1', status: 'degraded', problems: ['database_unavailable'] }, 503);
  }
});

app.post('/api/v1/webhooks/stripe', async (c) => {
  const mode = paymentsMode(c.env.STRIPE_PAYMENTS_MODE);
  if (mode === 'disabled') return c.json({ message: 'Payments are disabled.' }, 503);
  if (!c.env.STRIPE_WEBHOOK_SECRET) return c.json({ message: 'Stripe webhook is not configured.' }, 503);

  const raw = await bodyText(c, 1_048_576);
  const signature = c.req.header('Stripe-Signature') ?? '';
  if (!await verifyStripeSignature(raw, signature, c.env.STRIPE_WEBHOOK_SECRET)) {
    return c.json({ message: 'Invalid signature or payload.' }, 400);
  }
  const event = parseStripeEvent(raw);
  if (!event) return c.json({ message: 'Invalid signature or payload.' }, 400);
  if ((mode === 'test' && event.livemode) || (mode === 'live' && !event.livemode)) {
    return c.json({ message: 'Stripe event environment does not match the configured payment mode.' }, 403);
  }
  if (event.livemode && !enabled(c.env.STRIPE_LIVE_PAYMENTS_ENABLED)) {
    return c.json({ message: 'Live payments require explicit activation.' }, 403);
  }

  const result = await processStripeEvent(c.env, event);
  if (result.disposition === 'mismatch') {
    console.warn('Stripe event did not match the stored payment amount, currency, or external ID.', { eventId: event.id });
  }
  return c.json({ received: true });
});

app.post('/api/v1/webhooks/resend', async (c) => {
  if (!c.env.RESEND_WEBHOOK_SECRET) return c.json({ message: 'Resend webhook is not configured.' }, 503);

  const raw = await bodyText(c, 262_144);
  const headers = {
    id: c.req.header('svix-id') ?? '',
    timestamp: c.req.header('svix-timestamp') ?? '',
    signature: c.req.header('svix-signature') ?? '',
  };
  if (!verifyResendWebhook(raw, headers, c.env.RESEND_WEBHOOK_SECRET)) {
    return c.json({ message: 'Invalid signature or payload.' }, 400);
  }
  const event = parseResendEmailEvent(raw);
  if (!event) return c.json({ message: 'Invalid signature or payload.' }, 400);

  const result = await processResendEvent(c.env, { id: headers.id, ...event });
  if (result.disposition === 'unmatched' || result.disposition === 'ambiguous') {
    console.warn('Resend event could not be linked to exactly one email outbox row.', {
      eventId: headers.id,
      emailId: event.emailId,
      disposition: result.disposition,
    });
  }
  return c.json({ received: true });
});

app.notFound((c) => c.json({ message: 'Not found.' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ message: error.message }, error.status);
  console.error('Unhandled edge API error.', { error: safeErrorName(error) });
  return c.json({ message: 'This service is temporarily unavailable. Please try again shortly.' }, 503);
});

export { app };

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
