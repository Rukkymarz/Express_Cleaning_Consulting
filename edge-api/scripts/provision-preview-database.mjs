import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { Pool, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const edgeApiDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(edgeApiDirectory, "..");
const migrationDirectory = join(repositoryDirectory, "migration", "neon");

const expectedHostname =
  "ep-late-truth-b4zs2671-pooler.c-6.us-east-2.aws.neon.tech";
const ownerConnectionString = process.env.DATABASE_OWNER_URL;

if (!ownerConnectionString) {
  throw new Error(
    "DATABASE_OWNER_URL is required. Supply it through the process environment; never save it in the repository.",
  );
}

const ownerUrl = new URL(ownerConnectionString);
if (
  ownerUrl.protocol !== "postgresql:" ||
  ownerUrl.username !== "neondb_owner" ||
  ownerUrl.hostname !== expectedHostname ||
  !ownerUrl.hostname.includes("-pooler.") ||
  ownerUrl.pathname !== "/neondb"
) {
  throw new Error(
    "Refusing to provision an unexpected database. Check the Neon project, pooled endpoint, and database name.",
  );
}

neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: ownerConnectionString });
const client = await pool.connect();

const applyMigration = async (fileName) => {
  const sql = await readFile(join(migrationDirectory, fileName), "utf8");
  process.stdout.write(`Applying ${fileName}... `);
  await client.query(sql);
  process.stdout.write("done\n");
};

const putWorkerSecrets = (secrets) => {
  const wranglerEntry = join(
    edgeApiDirectory,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  const serializedSecrets = JSON.stringify(secrets);
  const result = spawnSync(process.execPath, [wranglerEntry, "secret", "bulk"], {
    cwd: edgeApiDirectory,
    encoding: "utf8",
    input: `${serializedSecrets}\n`,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    let diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    for (const value of Object.values(secrets)) {
      diagnostic = diagnostic.replaceAll(value, "[REDACTED]");
    }
    diagnostic = diagnostic.trim();
    throw new Error(
      `Cloudflare rejected the secret bundle.${diagnostic ? ` ${diagnostic}` : ""}`,
    );
  }

  process.stdout.write("Configured the Cloudflare secret bundle atomically.\n");
};

let runtimeConnectionString;
let rateLimitSalt;

try {
  const existingRole = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'ecc_edge_runtime'",
  );
  if (existingRole.rowCount) {
    throw new Error(
      "ecc_edge_runtime already exists. This bootstrap script intentionally refuses credential rotation on an active preview.",
    );
  }

  await applyMigration("001_schema.sql");
  await applyMigration("002_seed_reference.sql");
  await applyMigration("003_quote_workflow.sql");
  await applyMigration("004_stripe_webhook.sql");
  await applyMigration("005_staff_workflow.sql");

  const runtimePassword = randomBytes(32).toString("base64url");
  const escapedPassword = runtimePassword.replaceAll("'", "''");
  await client.query(
    `CREATE ROLE ecc_edge_runtime LOGIN PASSWORD '${escapedPassword}'`,
  );
  process.stdout.write("Created the limited runtime role.\n");

  await applyMigration("006_runtime_security.sql");
  await applyMigration("007_reset_sequences.sql");
  await applyMigration("009_fix_idempotent_replay.sql");
  await applyMigration("008_validate.sql");

  const runtimeUrl = new URL(ownerConnectionString);
  runtimeUrl.username = "ecc_edge_runtime";
  runtimeUrl.password = runtimePassword;
  runtimeConnectionString = runtimeUrl.toString();
  rateLimitSalt = randomBytes(32).toString("base64url");
} finally {
  client.release();
  await pool.end();
}

putWorkerSecrets({
  DATABASE_URL: runtimeConnectionString,
  RATE_LIMIT_SALT: rateLimitSalt,
});

runtimeConnectionString = undefined;
rateLimitSalt = undefined;
process.stdout.write(
  "Preview database provisioning and Cloudflare secret configuration completed.\n",
);
