import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";

const expectedHostname =
  "ep-late-truth-b4zs2671-pooler.c-6.us-east-2.aws.neon.tech";
const connectionString = process.env.DATABASE_OWNER_URL;
const receipt = process.env.TEST_RECEIPT;
const idempotencyKey = process.env.TEST_IDEMPOTENCY_KEY;

if (!connectionString || !receipt) {
  throw new Error(
    "DATABASE_OWNER_URL and TEST_RECEIPT are required.",
  );
}

const databaseUrl = new URL(connectionString);
if (
  databaseUrl.protocol !== "postgresql:" ||
  databaseUrl.username !== "neondb_owner" ||
  databaseUrl.hostname !== expectedHostname ||
  databaseUrl.pathname !== "/neondb"
) {
  throw new Error("Refusing to inspect an unexpected database.");
}
if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(receipt)) {
  throw new Error("TEST_RECEIPT must be a ULID.");
}
if (
  idempotencyKey &&
  (idempotencyKey.length < 8 || idempotencyKey.length > 120)
) {
  throw new Error("TEST_IDEMPOTENCY_KEY has an invalid length.");
}

neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString });

try {
  const result = await pool.query(
    `
      select
        sr.public_id as receipt,
        sr.status as request_status,
        a.region::text as region,
        count(distinct sr.id)::integer as request_count,
        count(distinct st.id)::integer as task_count,
        min(st.status)::text as task_status,
        count(distinct qn.id)::integer as notification_count,
        min(qn.status)::text as notification_status,
        count(distinct pe.id)::integer as idempotency_event_count
      from service_requests sr
      join audit_events ae
        on ae.entity_type = 'request_receipt'
       and ae.action = sr.public_id
      join provider_events pe
        on pe.id = ae.entity_id
       and pe.provider = 'public_request'
       and ($2::text is null or pe.event_id = $2)
      join addresses a on a.id = sr.address_id
      left join staff_tasks st
        on st.service_request_id = sr.id
       and st.kind = 'quote_review'
      left join quote_request_notifications qn
        on qn.service_request_id = sr.id
       and qn.staff_task_id = st.id
      where sr.public_id = $1
      group by sr.public_id, sr.status, a.region
    `,
    [receipt, idempotencyKey ?? null],
  );

  const workflow = result.rows[0];
  if (!workflow) throw new Error("The test workflow was not found.");
  for (const field of [
    "request_count",
    "task_count",
    "notification_count",
    "idempotency_event_count",
  ]) {
    if (workflow[field] !== 1) {
      throw new Error(`Expected exactly one ${field}, found ${workflow[field]}.`);
    }
  }

  process.stdout.write(`${JSON.stringify(workflow)}\n`);
} finally {
  await pool.end();
}
