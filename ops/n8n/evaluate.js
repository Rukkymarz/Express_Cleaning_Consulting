// A01 deterministic evaluator for the n8n "ECC - Operator failure alert" workflow.
// Pure function: no model calls, no I/O. The build script embeds this file
// verbatim in the workflow's Code node, and test/evaluate.test.mjs runs it.
//
// Input  : one HTTP probe result + the persisted monitor state.
// Output : { action, state, alert } where action is one of
//          'none' | 'alert' | 'recovery' | 'terminal'
//
// Rules
// - Dedupe: an alert with the same fingerprint is not re-sent until
//   REALERT_MS has passed. A changed fingerprint (new problem class, new
//   failure timestamp) alerts immediately.
// - Monitor failures (timeout, network, 5xx, bad JSON) are counted; after
//   TERMINAL_AFTER consecutive failures the monitor itself enters a visible
//   terminal state ('terminal' action -> Stop and Error node).
// - 401/503-unconfigured are configuration faults: terminal immediately.
// - Recovery is announced once when an alerting/terminal state clears.

const REALERT_MS = 6 * 60 * 60 * 1000;
const TERMINAL_AFTER = 3;

function fingerprintOf(parts) {
  return parts.filter(Boolean).join('|');
}

function evaluate(probe, previous, nowMs) {
  const prev = {
    lastFingerprint: null,
    lastAlertAt: 0,
    consecutiveProbeFailures: 0,
    mode: 'ok', // ok | alerting | terminal
    ...(previous || {}),
  };
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const code = Number(probe && probe.statusCode) || 0;
  const body = probe && typeof probe.body === 'object' && probe.body !== null ? probe.body : null;

  // 1. Configuration faults: retrying cannot fix these.
  if (code === 401 || (code === 503 && body && /not configured/i.test(String(body.message || '')))) {
    const fp = fingerprintOf(['config', String(code)]);
    const state = { ...prev, consecutiveProbeFailures: prev.consecutiveProbeFailures + 1, mode: 'terminal' };
    const repeat = prev.lastFingerprint === fp && now - prev.lastAlertAt < REALERT_MS;
    if (!repeat) { state.lastFingerprint = fp; state.lastAlertAt = now; }
    return {
      action: repeat ? 'none' : 'terminal',
      state,
      alert: {
        severity: 'critical',
        title: code === 401 ? 'Monitor token rejected by API' : 'Monitor endpoint not configured on API',
        problems: [code === 401 ? 'monitor_unauthorized' : 'monitor_unconfigured'],
        fingerprint: fp,
      },
    };
  }

  // 2. Probe failure: timeout, network error, 5xx without a health body, bad JSON.
  const validBody = body && body.schema === 'ecc.delivery-health.v1' && Array.isArray(body.problems || []);
  const databaseDown = validBody && body.status === 'degraded';
  if (!validBody || (code >= 500 && !databaseDown) || code === 0) {
    const failures = prev.consecutiveProbeFailures + 1;
    const state = { ...prev, consecutiveProbeFailures: failures };
    if (failures < TERMINAL_AFTER) return { action: 'none', state, alert: null };
    const fp = fingerprintOf(['probe', 'unreachable']);
    const repeat = prev.lastFingerprint === fp && now - prev.lastAlertAt < REALERT_MS;
    state.mode = 'terminal';
    if (!repeat) { state.lastFingerprint = fp; state.lastAlertAt = now; }
    return {
      action: repeat ? 'none' : 'terminal',
      state,
      alert: {
        severity: 'critical',
        title: `Quote API unreachable for ${failures} consecutive checks`,
        problems: ['monitor_unreachable', probe && probe.error ? String(probe.error).slice(0, 80) : `http_${code}`],
        fingerprint: fp,
      },
    };
  }

  // 3. Valid health body.
  const problems = databaseDown ? ['database_unavailable'] : body.problems.map(String);
  const state = { ...prev, consecutiveProbeFailures: 0 };
  if (problems.length === 0) {
    const wasBad = prev.mode !== 'ok';
    state.mode = 'ok';
    state.lastFingerprint = null;
    return wasBad
      ? { action: 'recovery', state, alert: { severity: 'info', title: 'Quote delivery recovered', problems: [], fingerprint: 'recovered' } }
      : { action: 'none', state, alert: null };
  }

  const fp = fingerprintOf(['delivery', problems.slice().sort().join(','), body.newest_problem_at || '']);
  const repeat = prev.lastFingerprint === fp && now - prev.lastAlertAt < REALERT_MS;
  state.mode = 'alerting';
  if (!repeat) { state.lastFingerprint = fp; state.lastAlertAt = now; }
  return {
    action: repeat ? 'none' : 'alert',
    state,
    alert: {
      severity: problems.some((p) => /^quote_|mail_not_configured|database_unavailable/.test(p)) ? 'critical' : 'warning',
      title: `Quote/mail delivery problem: ${problems.join(', ')}`,
      problems,
      counts: body.counts || {},
      oldestPendingMinutes: body.quote_oldest_pending_minutes ?? null,
      newestProblemAt: body.newest_problem_at || null,
      fingerprint: fp,
    },
  };
}

if (typeof module !== 'undefined') module.exports = { evaluate, REALERT_MS, TERMINAL_AFTER };
