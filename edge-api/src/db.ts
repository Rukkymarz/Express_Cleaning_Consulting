import { neon } from '@neondatabase/serverless';
import type { PreparedTestInvoice } from './stripe-api';
import type { CallbackRequest } from './validation';
import type { ClaimedLaunchMail, ClaimedNotification, ClaimedReviewRequest, Env } from './types';

type Sql = ReturnType<typeof neon>;

function sqlFor(env: Env): Sql {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return neon(env.DATABASE_URL);
}

export interface CatalogService {
  code: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  instant_eligible: boolean;
}

export interface CatalogMarket {
  slug: string;
  city: string;
  region: string;
  status: string;
}

export interface CreatedRequest {
  request_id: string;
  created: boolean;
  service_request_id: number | string;
  task_status: string;
  notification_status: string;
}

export interface RequestStatus {
  request_id: string;
  request_status: string;
  task_status: string;
  notification_status: string;
}

export interface CreatedIntake {
  receipt: string;
  created: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface StaffContext {
  user_id: number | string;
  name: string;
  email: string;
  permissions: string[];
}

export interface AccountContext {
  user_id: number | string;
  name: string;
  email: string;
  is_staff: boolean;
  permissions: string[];
}

export interface StaffAgent {
  id: number | string;
  name: string;
  email: string;
}

export interface StaffWorker {
  id: number | string;
  name: string;
  email: string;
}

export interface StaffLead {
  id: number | string;
  public_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  pipeline_stage: string;
  lead_score: number;
  assigned_agent_id: number | string | null;
  next_follow_up_at: string | null;
  created_at: string;
  service_request_id: number | string | null;
  request_receipt: string | null;
  service_name: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  task_id: string | null;
  task_status: string | null;
  notification_status: string | null;
  customer_id: number | string | null;
  customer_email: string | null;
  customer_linked: boolean;
  quote_id: string | null;
  quote_status: string | null;
  quote_total_cents: number | string | null;
  quote_deposit_cents: number | string | null;
  quote_expires_at: string | null;
  booking_id: string | null;
  booking_status: string | null;
}

export interface LinkedCustomer {
  customer_id: number | string;
  customer_email: string;
  linked: boolean;
}

export interface StaffInquiry {
  public_id: string;
  kind: string;
  name: string | null;
  email: string;
  status: string;
  details: Record<string, unknown> | string;
  created_at: string;
  total_count: number | string;
}

export interface StaffProspect {
  id: number | string;
  name: string;
  segment: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
  service_interest: string;
  source: string;
  status: string;
  notes: string | null;
  assigned_agent_id: number | string | null;
  next_follow_up_at: string | null;
  territory_priority: number;
}

export interface IssuedQuote {
  quote_id: string;
  revision: number | string;
  total_cents: number | string;
  deposit_cents: number | string;
  status: string;
  created: boolean;
}

export interface AcceptedQuote {
  quote_id: string;
  status: string;
  next_step: string;
}

export interface PreparedBooking {
  booking_id: string;
  status: string;
  created: boolean;
}

export interface TransitionedBooking {
  booking_id: string;
  status: string;
}

export interface AccountBooking {
  internal_id: number | string;
  public_id: string;
  status: string;
  start_at: string;
  end_at: string;
  time_zone: string;
  balance_due_cents: number | string;
}

export interface AccountQuoteItem {
  description: string;
  quantity: number | string;
  unit_cents: number | string;
  total_cents: number | string;
}

export interface AccountQuote {
  quote_id: string;
  status: string;
  revision: number | string;
  currency: string;
  subtotal_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
  deposit_cents: number | string;
  expires_at: string;
  accepted_at: string | null;
  request_receipt: string;
  service_name: string;
  location: string;
  items: AccountQuoteItem[] | string;
}

export interface AccountBookingDetail {
  public_id: string;
  status: string;
  total_cents: number | string;
  deposit_cents: number | string;
  balance_due_cents: number | string;
  hosted_invoice_url: string | null;
  payment_status: string | null;
  test_hosted_invoice_url: string | null;
  test_payment_status: string | null;
}

export interface AccountPayment {
  kind: string;
  environment: string;
  status: string;
  amount_cents: number | string;
  currency: string;
  created_at: string;
}

export interface AccountInvoice {
  invoice_number: string;
  currency: string;
  subtotal_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
  paid_cents: number | string;
  balance_due_cents: number | string;
  issued_at: string;
  due_at: string | null;
  service_at: string;
  time_zone: string;
  customer_name: string;
  customer_email: string;
  street: string | null;
  unit: string | null;
  city: string | null;
  region: string | null;
  postal_code: string;
}

export interface AccountInvoiceItem {
  description: string;
  quantity: number | string;
  unit_cents: number | string;
  total_cents: number | string;
}

export interface AccountPlan {
  id: number | string;
  public_id: string;
  frequency: string;
  status: string;
  next_service_on: string | null;
  booking_id: string;
}

export interface AccountPendingPlanChange {
  service_plan_id: number | string;
  action: string;
  created_at: string;
}

export interface AccountPlanChangeResult {
  request_id: number | string;
  status: string;
  created: boolean;
}

export interface CreatedServicePlan {
  plan_id: string;
  status: string;
  created: boolean;
}

export interface ResolvedPlanChange {
  request_id: number | string;
  status: string;
  plan_status: string;
  resolved: boolean;
}

export async function checkDatabase(env: Env): Promise<void> {
  const sql = sqlFor(env);
  await sql`select 1 as ok`;
}

export async function getAccountContext(env: Env, authUserId: string): Promise<AccountContext | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_context(${authUserId})`;
  return (rows as unknown as AccountContext[])[0] ?? null;
}

export async function getStaffContext(env: Env, authUserId: string): Promise<StaffContext | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_context(${authUserId})`;
  return (rows as unknown as StaffContext[])[0] ?? null;
}

export async function getStaffAgents(env: Env, authUserId: string): Promise<StaffAgent[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_agents(${authUserId})`;
  return rows as unknown as StaffAgent[];
}

export async function getStaffApprovedWorkers(env: Env, authUserId: string): Promise<StaffWorker[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_approved_workers(${authUserId})`;
  return rows as unknown as StaffWorker[];
}

export async function listStaffLeads(
  env: Env,
  authUserId: string,
  filters: {
    stage: string | null;
    agentId: number | null;
    unassigned: boolean;
    search: string | null;
    cursorScore: number | null;
    cursorId: number | null;
    limit: number;
  },
): Promise<StaffLead[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_list_leads(
    ${authUserId}, ${filters.stage}, ${filters.agentId}, ${filters.unassigned},
    ${filters.search}, ${filters.cursorScore}, ${filters.cursorId}, ${filters.limit}
  )`;
  return rows as unknown as StaffLead[];
}

export async function updateStaffLead(
  env: Env,
  authUserId: string,
  leadId: number,
  input: { status: string | null; nextFollowUpAt: string | null; setFollowUp: boolean },
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_update_lead(
    ${authUserId}, ${leadId}, ${input.status}, ${input.nextFollowUpAt}, ${input.setFollowUp}
  )`;
}

export async function assignStaffLead(env: Env, authUserId: string, leadId: number, agentId: number): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_assign_lead(${authUserId}, ${leadId}, ${agentId})`;
}

export async function linkStaffCustomer(
  env: Env,
  authUserId: string,
  leadId: number,
  customerEmail: string,
): Promise<LinkedCustomer> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_link_customer(${authUserId}, ${leadId}, ${customerEmail})`;
  const customer = (rows as unknown as LinkedCustomer[])[0];
  if (!customer?.customer_id) throw new Error('Customer linking returned no account.');
  return customer;
}

export async function updateStaffTask(env: Env, authUserId: string, taskId: string, status: string): Promise<Record<string, unknown>> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_update_task(${authUserId}, ${taskId}, ${status})`;
  return (rows as unknown as Record<string, unknown>[])[0] ?? {};
}

export async function listStaffInquiries(
  env: Env,
  authUserId: string,
  kind: string | null,
  page: number,
  perPage = 30,
): Promise<StaffInquiry[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_list_inquiries(${authUserId}, ${kind}, ${page}, ${perPage})`;
  return rows as unknown as StaffInquiry[];
}

export async function updateStaffInquiry(env: Env, authUserId: string, publicId: string, status: string): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_update_inquiry(${authUserId}, ${publicId}, ${status})`;
}

export async function listStaffProspects(
  env: Env,
  authUserId: string,
  filters: {
    segment: string | null;
    queue: string;
    before: string | null;
    region: string | null;
    search: string | null;
    cursorPriority: number | null;
    cursorId: number | null;
    limit: number;
  },
): Promise<StaffProspect[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_list_prospects(
    ${authUserId}, ${filters.segment}, ${filters.queue}, ${filters.before},
    ${filters.region}, ${filters.search}, ${filters.cursorPriority},
    ${filters.cursorId}, ${filters.limit}
  )`;
  return rows as unknown as StaffProspect[];
}

export async function createStaffProspect(
  env: Env,
  authUserId: string,
  input: {
    name: string; segment: string; email: string; phone: string; city: string;
    region: string; source: string; serviceInterest: string; notes: string;
  },
): Promise<number> {
  const sql = sqlFor(env);
  const rows = await sql`select app.staff_create_prospect(
    ${authUserId}, ${input.name}, ${input.segment}, ${input.email}, ${input.phone},
    ${input.city}, ${input.region}, ${input.source}, ${input.serviceInterest}, ${input.notes}
  ) as id`;
  return Number((rows as unknown as Array<{ id: number | string }>)[0]?.id);
}

export async function updateStaffProspect(
  env: Env,
  authUserId: string,
  prospectId: number,
  input: {
    status: string | null;
    notes: string | null;
    setNotes: boolean;
    nextFollowUpAt: string | null;
    setFollowUp: boolean;
    assignedAgentId: number | null;
    setAssignedAgent: boolean;
  },
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_update_prospect(
    ${authUserId}, ${prospectId}, ${input.status}, ${input.notes}, ${input.setNotes},
    ${input.nextFollowUpAt}, ${input.setFollowUp}, ${input.assignedAgentId}, ${input.setAssignedAgent}
  )`;
}

export async function convertStaffProspect(
  env: Env,
  authUserId: string,
  prospectId: number,
  leadPublicId: string,
): Promise<number> {
  const sql = sqlFor(env);
  const rows = await sql`select app.staff_convert_prospect(${authUserId}, ${prospectId}, ${leadPublicId}) as lead_id`;
  return Number((rows as unknown as Array<{ lead_id: number | string }>)[0]?.lead_id);
}

export async function issueStaffQuote(
  env: Env,
  authUserId: string,
  serviceRequestId: number,
  quotePublicId: string,
  idempotencyKey: string,
  input: {
    items: Array<{ description: string; quantity: number; unit_cents: number }>;
    tax_cents: number;
    deposit_cents: number;
    expires_at: string;
  },
): Promise<IssuedQuote> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_issue_quote(
    ${authUserId}, ${serviceRequestId}, ${quotePublicId}, ${idempotencyKey},
    ${JSON.stringify(input.items)}::jsonb, ${input.tax_cents}, ${input.deposit_cents},
    ${input.expires_at}::timestamptz
  )`;
  const quote = (rows as unknown as IssuedQuote[])[0];
  if (!quote?.quote_id) throw new Error('Quote workflow returned no receipt.');
  return quote;
}

export async function acceptCustomerQuote(
  env: Env,
  authUserId: string,
  quotePublicId: string,
): Promise<AcceptedQuote> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.customer_accept_quote(${authUserId}, ${quotePublicId})`;
  const quote = (rows as unknown as AcceptedQuote[])[0];
  if (!quote?.quote_id) throw new Error('Quote acceptance returned no receipt.');
  return quote;
}

export async function prepareStaffBooking(
  env: Env,
  authUserId: string,
  input: {
    quotePublicId: string;
    workerId: number;
    startAt: string;
    endAt: string;
    timeZone: string;
    bookingPublicId: string;
    invoicePublicId: string;
  },
): Promise<PreparedBooking> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_prepare_booking(
    ${authUserId}, ${input.quotePublicId}, ${input.workerId},
    ${input.startAt}::timestamptz, ${input.endAt}::timestamptz, ${input.timeZone},
    ${input.bookingPublicId}, ${input.invoicePublicId}
  )`;
  const booking = (rows as unknown as PreparedBooking[])[0];
  if (!booking?.booking_id) throw new Error('Booking workflow returned no receipt.');
  return booking;
}

export async function transitionStaffBooking(
  env: Env,
  authUserId: string,
  bookingId: number,
  input: { action: string; qualityConfirmed: boolean; notes: string },
): Promise<TransitionedBooking> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_transition_booking(
    ${authUserId}, ${bookingId}, ${input.action}, ${input.qualityConfirmed}, ${input.notes}
  )`;
  const booking = (rows as unknown as TransitionedBooking[])[0];
  if (!booking?.booking_id) throw new Error('Booking transition returned no receipt.');
  return booking;
}

export async function createStaffServicePlan(
  env: Env,
  authUserId: string,
  bookingId: number,
  planPublicId: string,
  nextServiceOn: string | null,
): Promise<CreatedServicePlan> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_create_service_plan(
    ${authUserId}, ${bookingId}, ${planPublicId}, ${nextServiceOn}::date, ${true}
  )`;
  const plan = (rows as unknown as CreatedServicePlan[])[0];
  if (!plan?.plan_id) throw new Error('Service plan workflow returned no receipt.');
  return plan;
}

export async function resolveStaffPlanChange(
  env: Env,
  authUserId: string,
  changeId: number,
  decision: string,
  nextServiceOn: string | null,
): Promise<ResolvedPlanChange> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_resolve_plan_change(
    ${authUserId}, ${changeId}, ${decision}, ${nextServiceOn}::date
  )`;
  const result = (rows as unknown as ResolvedPlanChange[])[0];
  if (!result?.request_id) throw new Error('Plan resolution workflow returned no receipt.');
  return result;
}

export async function listAccountBookings(
  env: Env,
  authUserId: string,
  cursorId: number | null,
  limit: number,
): Promise<AccountBooking[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_bookings(${authUserId}, ${cursorId}, ${limit})`;
  return rows as unknown as AccountBooking[];
}

export async function listAccountQuotes(env: Env, authUserId: string): Promise<AccountQuote[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_quotes(${authUserId})`;
  return rows as unknown as AccountQuote[];
}

export async function getAccountBooking(
  env: Env,
  authUserId: string,
  publicId: string,
): Promise<AccountBookingDetail | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_get_booking(${authUserId}, ${publicId})`;
  return (rows as unknown as AccountBookingDetail[])[0] ?? null;
}

export async function listAccountPayments(
  env: Env,
  authUserId: string,
  bookingPublicId: string,
): Promise<AccountPayment[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_payments(${authUserId}, ${bookingPublicId})`;
  return rows as unknown as AccountPayment[];
}

export async function getAccountInvoice(
  env: Env,
  authUserId: string,
  bookingPublicId: string,
): Promise<AccountInvoice | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_get_invoice(${authUserId}, ${bookingPublicId})`;
  return (rows as unknown as AccountInvoice[])[0] ?? null;
}

export async function listAccountInvoiceItems(
  env: Env,
  authUserId: string,
  bookingPublicId: string,
): Promise<AccountInvoiceItem[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_invoice_items(${authUserId}, ${bookingPublicId})`;
  return rows as unknown as AccountInvoiceItem[];
}

export async function listAccountPlans(env: Env, authUserId: string): Promise<AccountPlan[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_plans(${authUserId})`;
  return rows as unknown as AccountPlan[];
}

export async function listAccountPendingPlanChanges(
  env: Env,
  authUserId: string,
): Promise<AccountPendingPlanChange[]> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_list_pending_plan_changes(${authUserId})`;
  return rows as unknown as AccountPendingPlanChange[];
}

export async function requestAccountPlanChange(
  env: Env,
  authUserId: string,
  planPublicId: string,
  action: string,
  reason: string,
): Promise<AccountPlanChangeResult> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.account_request_plan_change(
    ${authUserId}, ${planPublicId}, ${action}, ${reason}
  )`;
  const result = (rows as unknown as AccountPlanChangeResult[])[0];
  if (!result?.request_id) throw new Error('Plan change workflow returned no receipt.');
  return result;
}

export async function prepareStaffTestInvoice(
  env: Env,
  authUserId: string,
  bookingId: string,
  mode: 'deposit' | 'full' | 'balance',
  daysUntilDue: number,
  idempotencyKey: string,
): Promise<PreparedTestInvoice> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.staff_prepare_test_invoice(
    ${authUserId}, ${bookingId}, ${mode}, ${daysUntilDue}, ${idempotencyKey}
  )`;
  const invoice = (rows as unknown as PreparedTestInvoice[])[0];
  if (!invoice?.payment_id) throw new Error('Test invoice workflow returned no payment.');
  return invoice;
}

export async function recordStaffTestInvoice(
  env: Env,
  authUserId: string,
  paymentId: number | string,
  result: {
    customerId: string;
    invoiceId: string;
    hostedInvoiceUrl: string;
    invoicePdfUrl: string | null;
  },
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_record_test_invoice(
    ${authUserId}, ${paymentId}, ${result.customerId}, ${result.invoiceId},
    ${result.hostedInvoiceUrl}, ${result.invoicePdfUrl}
  )`;
}

export async function holdStaffTestInvoiceForReconciliation(
  env: Env,
  authUserId: string,
  paymentId: number | string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.staff_hold_test_invoice_for_reconciliation(${authUserId}, ${paymentId})`;
}

export async function getCatalog(env: Env): Promise<{ services: CatalogService[]; markets: CatalogMarket[] }> {
  const sql = sqlFor(env);
  const [services, markets] = await Promise.all([
    sql`select * from app.public_catalog_services()`,
    sql`select * from app.public_catalog_markets()`,
  ]);
  return {
    services: services as unknown as CatalogService[],
    markets: markets as unknown as CatalogMarket[],
  };
}

export async function createCallbackRequest(
  env: Env,
  input: CallbackRequest,
  ids: { request: string; lead: string; task: string },
  idempotencyKey: string,
  reviewUrl: string,
): Promise<CreatedRequest> {
  const sql = sqlFor(env);
  const rows = await sql`
    select * from app.create_callback_request(
      ${idempotencyKey}, ${ids.request}, ${ids.lead}, ${ids.task},
      ${input.contact.name}, ${input.contact.phone}, ${input.contact.email ?? ''},
      ${input.service_code}, ${input.address.region}, ${input.address.postal_code}, ${input.notes ?? ''},
      ${input.promotion_code ?? ''}, ${reviewUrl}
    )`;
  const row = (rows as unknown as CreatedRequest[])[0];
  if (!row?.request_id) throw new Error('Request workflow did not return a receipt.');
  return row;
}

export async function getRequestStatus(env: Env, requestId: string): Promise<RequestStatus | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.request_workflow_status(${requestId})`;
  return (rows as unknown as RequestStatus[])[0] ?? null;
}

export async function createPublicIntake(
  env: Env,
  input: {
    requestKey: string;
    publicId: string;
    kind: string;
    payloadHash: string;
    name: string;
    email: string;
    details: Record<string, string | number | boolean>;
    marketingEmail: boolean;
    staffTo: string;
    staffBody: string;
    discountBody: string;
  },
): Promise<CreatedIntake> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.create_public_intake(
    ${input.requestKey}, ${input.publicId}, ${input.kind}, ${input.payloadHash},
    ${input.name}, ${input.email}, ${JSON.stringify(input.details)}::jsonb,
    ${input.marketingEmail}, ${input.staffTo}, ${input.staffBody}, ${input.discountBody}
  )`;
  const row = (rows as unknown as CreatedIntake[])[0];
  if (!row?.receipt) throw new Error('Intake workflow did not return a receipt.');
  return row;
}

export async function consumeRateLimit(
  env: Env,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.consume_api_rate_limit(${bucketKey}, ${limit}, ${windowSeconds})`;
  const result = (rows as unknown as RateLimitResult[])[0];
  if (!result) throw new Error('Rate-limit workflow returned no result.');
  return {
    allowed: Boolean(result.allowed),
    remaining: Number(result.remaining),
    retry_after_seconds: Number(result.retry_after_seconds),
  };
}

export async function pruneRateLimits(env: Env): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.prune_api_rate_limits()`;
}

export async function claimQuoteNotification(env: Env): Promise<ClaimedNotification | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.claim_quote_notification()`;
  return (rows as unknown as ClaimedNotification[])[0] ?? null;
}

export async function markQuoteNotificationSent(
  env: Env,
  id: number | string,
  token: string,
  providerMessageId: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_quote_notification_sent(${id}, ${token}, ${providerMessageId})`;
}

export async function markQuoteNotificationRetry(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_quote_notification_retry(${id}, ${token}, ${reason})`;
}

export async function markQuoteNotificationFailed(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_quote_notification_failed(${id}, ${token}, ${reason})`;
}

export async function claimLaunchMail(env: Env): Promise<ClaimedLaunchMail | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.claim_launch_mail()`;
  return (rows as unknown as ClaimedLaunchMail[])[0] ?? null;
}

export async function markLaunchMailSent(
  env: Env,
  id: number | string,
  token: string,
  providerMessageId: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_launch_mail_sent(${id}, ${token}, ${providerMessageId})`;
}

export async function markLaunchMailRetry(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_launch_mail_retry(${id}, ${token}, ${reason})`;
}

export async function markLaunchMailFailed(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_launch_mail_failed(${id}, ${token}, ${reason})`;
}

export async function claimReviewRequest(env: Env, delayHours: number): Promise<ClaimedReviewRequest | null> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.claim_review_request(${delayHours})`;
  return (rows as unknown as ClaimedReviewRequest[])[0] ?? null;
}

export async function markReviewRequestSent(
  env: Env,
  id: number | string,
  token: string,
  providerMessageId: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_review_request_sent(${id}, ${token}, ${providerMessageId})`;
}

export async function markReviewRequestRetry(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_review_request_retry(${id}, ${token}, ${reason})`;
}

export async function markReviewRequestFailed(
  env: Env,
  id: number | string,
  token: string,
  reason: string,
): Promise<void> {
  const sql = sqlFor(env);
  await sql`select app.mark_review_request_failed(${id}, ${token}, ${reason})`;
}

export interface StripeEventResult {
  disposition: 'processed' | 'duplicate' | 'unmatched' | 'mismatch' | 'ignored';
  payment_id: number | string | null;
  payment_status: string | null;
}

export async function processStripeEvent(
  env: Env,
  event: { id: string; type: string; livemode: boolean; data: { object: Record<string, unknown> } },
): Promise<StripeEventResult> {
  const sql = sqlFor(env);
  const rows = await sql`select * from app.process_stripe_event(
    ${event.id}, ${event.type}, ${event.livemode}, ${JSON.stringify(event.data.object)}::jsonb
  )`;
  const result = (rows as unknown as StripeEventResult[])[0];
  if (!result) throw new Error('Stripe workflow returned no result.');
  return result;
}
