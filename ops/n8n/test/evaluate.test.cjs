const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, REALERT_MS, TERMINAL_AFTER } = require('../evaluate.js');

const ok = { statusCode: 200, body: { schema: 'ecc.delivery-health.v1', status: 'ok', problems: [] } };
const bad = (problems, at = '2026-11-20T10:00:00.000Z') => ({
  statusCode: 200,
  body: { schema: 'ecc.delivery-health.v1', status: 'alert', problems, counts: { quote_terminal: 1 }, newest_problem_at: at },
});
const T0 = 1_700_000_000_000;

test('healthy probe does nothing and resets failures', () => {
  const r = evaluate(ok, { consecutiveProbeFailures: 2 }, T0);
  assert.equal(r.action, 'none');
  assert.equal(r.state.consecutiveProbeFailures, 0);
});

test('new delivery problem alerts once, duplicate is suppressed', () => {
  const a = evaluate(bad(['quote_terminal']), null, T0);
  assert.equal(a.action, 'alert');
  assert.equal(a.alert.severity, 'critical');
  const b = evaluate(bad(['quote_terminal']), a.state, T0 + 60_000);
  assert.equal(b.action, 'none');
});

test('same problem re-alerts after the window', () => {
  const a = evaluate(bad(['quote_terminal']), null, T0);
  const b = evaluate(bad(['quote_terminal']), a.state, T0 + REALERT_MS + 1);
  assert.equal(b.action, 'alert');
});

test('a newer failure changes the fingerprint and alerts immediately', () => {
  const a = evaluate(bad(['quote_terminal']), null, T0);
  const b = evaluate(bad(['quote_terminal'], '2026-11-20T11:00:00.000Z'), a.state, T0 + 60_000);
  assert.equal(b.action, 'alert');
});

test('recovery is announced exactly once', () => {
  const a = evaluate(bad(['launch_stuck']), null, T0);
  assert.equal(a.alert.severity, 'warning');
  const b = evaluate(ok, a.state, T0 + 1);
  assert.equal(b.action, 'recovery');
  const c = evaluate(ok, b.state, T0 + 2);
  assert.equal(c.action, 'none');
});

test('probe failures are bounded then terminal, and terminal is deduped', () => {
  let s = null;
  for (let i = 1; i < TERMINAL_AFTER; i += 1) {
    const r = evaluate({ statusCode: 0, error: 'ETIMEDOUT' }, s, T0 + i);
    assert.equal(r.action, 'none');
    s = r.state;
  }
  const t = evaluate({ statusCode: 0, error: 'ETIMEDOUT' }, s, T0 + 10);
  assert.equal(t.action, 'terminal');
  assert.equal(t.state.mode, 'terminal');
  const again = evaluate({ statusCode: 502, body: null }, t.state, T0 + 20);
  assert.equal(again.action, 'none');
  const back = evaluate(ok, again.state, T0 + 30);
  assert.equal(back.action, 'recovery');
});

test('401 and unconfigured are terminal immediately', () => {
  assert.equal(evaluate({ statusCode: 401, body: { message: 'Unauthorized.' } }, null, T0).action, 'terminal');
  const u = evaluate({ statusCode: 503, body: { message: 'Operator health monitoring is not configured.' } }, null, T0);
  assert.equal(u.action, 'terminal');
  assert.deepEqual(u.alert.problems, ['monitor_unconfigured']);
});

test('database degraded body is a critical alert, not a probe failure', () => {
  const r = evaluate({ statusCode: 503, body: { schema: 'ecc.delivery-health.v1', status: 'degraded', problems: ['database_unavailable'] } }, null, T0);
  assert.equal(r.action, 'alert');
  assert.equal(r.alert.severity, 'critical');
});

test('garbage body counts as probe failure', () => {
  const r = evaluate({ statusCode: 200, body: '<html>blocked</html>' }, null, T0);
  assert.equal(r.action, 'none');
  assert.equal(r.state.consecutiveProbeFailures, 1);
});
