# A01 — Operator failure alert (n8n)

An independent monitor for quote intake. It runs on n8n, outside the
Cloudflare Worker, so it still reports when the Worker, Neon or Resend fail.
It makes no model calls: every routing, retry, dedupe and terminal-state
decision lives in `evaluate.js`. FreeLLMAPI is not in this path.

## Why polling, not webhooks

n8n runs on the owner's PC at `localhost:5678` and is not publicly reachable,
so the Worker cannot push events to it. n8n polls the API **outbound** every
15 minutes instead. No tunnel and no open port are needed.

Limitation: when the PC is asleep or off, nothing is monitoring. Covering that
needs an always-on host, or a Worker-side self-alert from the hourly cron.
That is a separate decision for the owner.

## Pieces

| Piece | File |
| --- | --- |
| PII-free aggregate query (SECURITY DEFINER, runtime role only) | `migration/neon/013_ops_delivery_health.sql` |
| `GET /api/v1/ops/delivery-health` (Bearer token, 30/min, fails closed) | `edge-api/src/ops.ts`, `edge-api/src/index.ts` |
| Deterministic evaluator (dedupe, bounded failures, terminal, recovery) | `ops/n8n/evaluate.js` |
| n8n workflow (built from the evaluator; **inactive**, sender **disabled**) | `ops/n8n/ecc-operator-failure-alert.json` |
| Tests | `edge-api/test/ops.test.ts`, `ops/n8n/test/evaluate.test.cjs` |

Rebuild the workflow after editing the evaluator: `python3 ops/n8n/build_workflow.py`.

## Behaviour

| Probe result | Action |
| --- | --- |
| `status: ok` | nothing; announce **recovery** once if previously alerting |
| new problem set or newer failure time | **alert** (critical if quote/mail/database, else warning) |
| same problem within 6 h | suppressed |
| timeout / network / 5xx / non-JSON | counted; the **3rd consecutive** failure goes **terminal** |
| 401 or "not configured" | **terminal** immediately (config fault) |

Timeouts: HTTP 10 s; n8n retries 3 times, 5 s apart; workflow execution cap 120 s.
The terminal state ends in a *Stop and Error* node, so the run shows as
**Error** in n8n → Executions.

## Enable (owner approval needed at steps 1, 3 and 5)

1. Apply `013_ops_delivery_health.sql` to Neon with the owner role.
2. Generate a token of 32+ random characters. Store it only as a Worker secret:
   `npx wrangler secret put OPS_HEALTH_TOKEN` (in `edge-api/`).
3. Deploy the API Worker. The endpoint returns `503 not configured` until the secret exists.
4. In n8n, create an **HTTP Header Auth** credential named `ECC Ops Health Token`
   (Name `Authorization`, Value `Bearer <token>`). n8n stores it encrypted.
   Import the workflow and attach the credential to *Probe delivery health*.
5. Replace *SEND ALERT – destination not chosen* with the approved destination
   node. Set a 15 s timeout and Retry On Fail (max 3, 10 s apart). Then activate the workflow.

## Isolated test (no real sends)

Run `node --test ops/n8n/test/evaluate.test.cjs` with the destination node disabled.
For an end-to-end failure test, point the HTTP node at a non-existent path so
the third run goes terminal. No production data is touched.
