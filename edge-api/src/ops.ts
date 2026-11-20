// A01 operator failure alert — machine-readable delivery health.
// The endpoint is read-only, returns aggregate counts only, and fails closed:
// no OPS_HEALTH_TOKEN configured means 503, a wrong token means 401.

export const MIN_OPS_TOKEN_LENGTH = 32;

export interface DeliveryHealthRow {
  checked_at: string | Date;
  quote_terminal: number | string;
  quote_stuck: number | string;
  quote_oldest_pending_minutes: number | string;
  quote_provider_problem: number | string;
  launch_terminal: number | string;
  launch_stuck: number | string;
  launch_provider_problem: number | string;
  review_terminal: number | string;
  newest_problem_at: string | Date | null;
  last_quote_sent_at: string | Date | null;
}

export type OpsAuthResult = 'ok' | 'unconfigured' | 'unauthorized';

function constantTimeEqual(left: string, right: string): boolean {
  // Compare full length of the expected value regardless of input length.
  let difference = left.length ^ right.length;
  for (let index = 0; index < right.length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function checkOpsToken(authorization: string | undefined, configured: string | undefined): OpsAuthResult {
  if (!configured || configured.length < MIN_OPS_TOKEN_LENGTH) return 'unconfigured';
  const match = /^Bearer (\S+)$/.exec(authorization ?? '');
  if (!match) return 'unauthorized';
  const presented = match[1] ?? '';
  return constantTimeEqual(presented, configured) ? 'ok' : 'unauthorized';
}

const iso = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export function deliveryHealthBody(row: DeliveryHealthRow, mailConfigurationError: string | null) {
  const n = (value: number | string) => Number(value);
  const counts = {
    quote_terminal: n(row.quote_terminal),
    quote_stuck: n(row.quote_stuck),
    quote_provider_problem: n(row.quote_provider_problem),
    launch_terminal: n(row.launch_terminal),
    launch_stuck: n(row.launch_stuck),
    launch_provider_problem: n(row.launch_provider_problem),
    review_terminal: n(row.review_terminal),
  };
  const problems = Object.entries(counts).filter(([, value]) => value > 0).map(([key]) => key);
  if (mailConfigurationError) problems.unshift('mail_not_configured');
  return {
    schema: 'ecc.delivery-health.v1',
    status: problems.length ? 'alert' : 'ok',
    problems,
    counts,
    quote_oldest_pending_minutes: n(row.quote_oldest_pending_minutes),
    mail_configured: !mailConfigurationError,
    newest_problem_at: iso(row.newest_problem_at),
    last_quote_sent_at: iso(row.last_quote_sent_at),
    checked_at: iso(row.checked_at),
  };
}
