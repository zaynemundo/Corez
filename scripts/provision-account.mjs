#!/usr/bin/env node
/**
 * Provision a CoreZ account directly in D1.
 *
 * Creates a user with the exact same password scheme as worker/auth.js
 * (PBKDF2-SHA256, 100_000 iterations, 16-byte salt, 256-bit key, stored as
 * `b64url(salt).b64url(bits)`) so the normal email/password login verifies it,
 * then re-reads the row and verifies the password through the real
 * `verifyPassword()` implementation before reporting success.
 *
 * Usage:
 *   COREZ_ACCOUNT_PASSWORD='...' node scripts/provision-account.mjs \
 *     --email someone@corez.pro --plan premium --permanent --remote
 *
 * Flags:
 *   --email <address>     required
 *   --plan <name>         free | standard | premium   (default: free)
 *   --permanent           never expires (subscription_period_end = NULL)
 *   --days <n>            alternative to --permanent; sets a period end
 *   --remote | --local    required; chooses the D1 target
 *   --allow-existing      update the existing account instead of refusing
 *
 * The password is read from COREZ_ACCOUNT_PASSWORD (never argv, which would
 * leak it into the process list and shell history).
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyPassword } from "../worker/auth.js";

const DATABASE = "corez-auth";
const WRANGLER = "node_modules/wrangler/bin/wrangler.js";
const PLANS = new Set(["free", "standard", "premium"]);

function parseArgs(argv) {
  const args = { plan: "free", permanent: false, days: null, target: null, allowExisting: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") args.email = argv[++i];
    else if (a === "--plan") args.plan = String(argv[++i] || "").toLowerCase();
    else if (a === "--permanent") args.permanent = true;
    else if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--remote") args.target = "remote";
    else if (a === "--local") args.target = "local";
    else if (a === "--allow-existing") args.allowExisting = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const USAGE = `Provision a CoreZ account.

  COREZ_ACCOUNT_PASSWORD='...' node scripts/provision-account.mjs \\
    --email someone@corez.pro --plan premium --permanent --remote

Flags:
  --email <address>     required
  --plan <name>         free | standard | premium   (default: free)
  --permanent           never expires (subscription_period_end = NULL)
  --days <n>            alternative to --permanent; sets a period end
  --remote | --local    required; chooses the D1 target
  --allow-existing      update the existing account instead of refusing
`;

/** Run wrangler without a shell so SQL containing spaces is not re-split. */
function wrangler(args) {
  return execFileSync(
    process.execPath,
    [WRANGLER, "d1", "execute", DATABASE, ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

function query(sql, target) {
  const out = wrangler([`--${target}`, "--json", "--command", sql]);
  return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
}

function execute(sqlFile, target) {
  wrangler([`--${target}`, "--file", sqlFile]);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${b64url(salt)}.${b64url(bits)}`;
}

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.email) throw new Error("--email is required");
  if (!args.target) throw new Error("choose a target explicitly: --remote (production) or --local");
  if (!PLANS.has(args.plan)) throw new Error(`--plan must be one of ${[...PLANS].join(", ")}`);
  if (args.permanent && args.days) throw new Error("use either --permanent or --days, not both");

  const email = String(args.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("email looks invalid");

  const password = process.env.COREZ_ACCOUNT_PASSWORD;
  if (!password) throw new Error("COREZ_ACCOUNT_PASSWORD is not set");
  if (password.length < 8) throw new Error("password must be at least 8 characters");

  console.log(`target: ${args.target.toUpperCase()} database "${DATABASE}"`);

  const existing = query(
    `SELECT id, plan FROM users WHERE lower(email) = ${sqlString(email)}`,
    args.target,
  );
  if (existing.length && !args.allowExisting) {
    throw new Error(
      `${email} already exists (id ${existing[0].id}, plan ${existing[0].plan}). ` +
        `Pass --allow-existing to update it.`,
    );
  }

  const now = Date.now();
  const periodEnd = args.permanent ? null : args.days ? now + args.days * 86_400_000 : null;
  const effectivePlan = args.plan;

  const sql = existing.length
    ? `UPDATE users SET plan=${sqlString(effectivePlan)}, subscription_plan=${sqlString(effectivePlan)},
       subscription_status='active', subscription_period_end=${periodEnd === null ? "NULL" : periodEnd},
       downgrade_plan=NULL, downgrade_scheduled_at=NULL, subscription_ziina_id=NULL,
       password_hash=${sqlString(await hashPassword(password))}
       WHERE lower(email) = ${sqlString(email)};\n`
    : `INSERT INTO users (
  id, email, password_hash, provider, created_at,
  plan, subscription_plan, subscription_status,
  subscription_period_end, subscription_ziina_id,
  downgrade_plan, downgrade_scheduled_at
) VALUES (
  ${sqlString(randomUUID())},
  ${sqlString(email)},
  ${sqlString(await hashPassword(password))},
  'local',
  ${now},
  ${sqlString(effectivePlan)},
  ${sqlString(effectivePlan)},
  'active',
  ${periodEnd === null ? "NULL" : periodEnd},
  NULL,
  NULL,
  NULL
);\n`;

  // The SQL holds the password hash: write it to a private temp dir, run it,
  // then remove it so the hash never lingers on disk.
  const dir = mkdtempSync(join(tmpdir(), "corez-provision-"));
  const file = join(dir, "provision.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    execute(file, args.target);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Verify through the real production verifier, not just by reading the row.
  const row = query(
    `SELECT email, plan, subscription_plan, subscription_status, subscription_period_end, provider, password_hash
     FROM users WHERE lower(email) = ${sqlString(email)}`,
    args.target,
  )[0];
  if (!row) throw new Error("verification failed: row not found after write");

  const ok = await verifyPassword(password, row.password_hash);
  const planOk = row.plan === effectivePlan && row.subscription_status === "active";
  const expiryOk = row.subscription_period_end === null;

  console.log("");
  console.log(`  email:      ${row.email}`);
  console.log(`  plan:       ${row.plan} (${row.subscription_status})`);
  console.log(`  expires:    ${expiryOk ? "never" : new Date(Number(row.subscription_period_end)).toISOString()}`);
  console.log(`  login:      ${row.provider}`);
  console.log(`  password:   ${ok ? "verifies" : "DOES NOT VERIFY"}`);
  console.log("");

  if (!ok || !planOk) {
    throw new Error("verification failed — the account would not log in correctly");
  }
  console.log(`OK: ${email} is ${row.plan}${expiryOk ? " (permanent)" : ""} and its password verifies.`);
}

main().catch((err) => {
  console.error(`provision-account failed: ${err.message}`);
  process.exitCode = 1;
});
