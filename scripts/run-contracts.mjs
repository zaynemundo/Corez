#!/usr/bin/env node
/**
 * Contract suite runner.
 *
 * `npm test` covers the unit suite. These checks cover what a unit test cannot:
 * the Worker's HTTP behaviour, the published-page and queue contracts, the
 * security invariants, and the UI/design contracts that read the CSS.
 *
 * Two rules this file exists to enforce:
 *
 *  1. EVERY failure is reported. The old `a && b && c` npm chain stopped at the
 *     first failing script, which hid two more stale expectations behind
 *     cloudflare-worker-contract.mjs for months: each run only ever revealed the
 *     leftmost red. One run now names every red script, with its output tail.
 *
 *  2. A skipped check is not a pass. If `bash` cannot be found, the shell
 *     contracts are reported as SKIPPED and the run exits non-zero — a green
 *     exit must mean every check actually ran.
 *
 * Usage:
 *   node scripts/run-contracts.mjs                 # everything
 *   node scripts/run-contracts.mjs --only publish  # checks whose name matches
 *   node scripts/run-contracts.mjs --list          # names only, no execution
 *
 * On Windows, `bash` on PATH is often the WSL launcher, which cannot run these
 * scripts. Git Bash is used instead when it is installed; set COREZ_BASH to
 * point at a specific shell.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/** name | "node" | "bash" + the script it runs. `name` is what --only matches. */
const CHECKS = [
  { name: "worker behaviour", runner: "node", script: "tests/cloudflare-worker-contract.mjs" },
  { name: "web search", runner: "node", script: "tests/search-worker-contract.mjs" },
  { name: "workers-ai rerank + embed", runner: "node", script: "tests/workers-ai-rerank-embed-contract.mjs" },
  { name: "inspiration cache", runner: "node", script: "tests/inspiration-worker-contract.mjs" },
  { name: "task status", runner: "node", script: "tests/task-status-worker-contract.mjs" },
  { name: "analytics", runner: "node", script: "tests/analytics-worker-contract.mjs" },
  { name: "site analytics", runner: "node", script: "tests/site-analytics-contract.mjs" },
  { name: "publish management", runner: "node", script: "tests/publish-management-contract.mjs" },
  { name: "usage metering", runner: "node", script: "tests/usage-metering-contract.mjs" },
  { name: "streaming connection", runner: "node", script: "tests/streaming-connection-contract.mjs" },
  { name: "worker config", runner: "bash", script: "tests/cloudflare-worker-config-contract.sh" },
  { name: "workers-ai provider", runner: "bash", script: "tests/workers-ai-provider-contract.sh" },
  { name: "public AI proxy", runner: "bash", script: "tests/public-ai-proxy-contract.sh" },
  { name: "live intent eval (static)", runner: "bash", script: "tests/ai-live-intent-eval-contract.sh" },
  { name: "live intent eval (response)", runner: "node", script: "tests/ai-live-intent-eval-response-contract.mjs" },
  { name: "env question skill", runner: "bash", script: "tests/env-question-skill-contract.sh" },
  { name: "UI responsive", runner: "bash", script: "tests/ui-responsive-contract.sh" },
  { name: "thinking indicator", runner: "bash", script: "tests/thinking-indicator-contract.sh" },
  { name: "public intent", runner: "bash", script: "tests/ai-public-intent-contract.sh" },
  { name: "local intent classifier", runner: "bash", script: "tests/ai-local-intent-classifier-contract.sh" },
  { name: "AGY wrapper", runner: "bash", script: "tests/agy-wrapper-contract.sh" },
  { name: "git superpowers", runner: "bash", script: "tests/git-superpowers-contract.sh" }
];

const TAIL_LINES = 25;

function parseArgs(argv) {
  const options = { only: null, list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") options.list = true;
    else if (arg.startsWith("--only=")) options.only = arg.slice("--only=".length);
    // Also accept `--only <substring>`: quoting a pattern with a space is
    // awkward enough in PowerShell that the two forms should both work.
    else if (arg === "--only") options.only = argv[++index] ?? null;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/run-contracts.mjs [--list] [--only=<substring> | --only <substring>]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (options.only === "") {
    console.error("--only needs a substring to match check names against.");
    process.exit(2);
  }
  return options;
}

/**
 * A shell that can actually run the checks. On Windows the `bash` on PATH is
 * often WSL's launcher, which fails with "No such file or directory" — probing
 * for a real one beats a wall of confusing failures.
 */
function resolveBash() {
  const candidates =
    process.platform === "win32"
      ? [
          process.env.COREZ_BASH,
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
          "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
          "bash"
        ]
      : ["bash"];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes("\\") && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-c", "printf ok"], { encoding: "utf8" });
    if (probe.status === 0 && (probe.stdout || "").includes("ok")) return candidate;
  }
  return null;
}

function runCheck(check, bash) {
  const started = Date.now();
  const [command, ...args] =
    check.runner === "bash" ? [bash, check.script] : ["node", check.script];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  return {
    check,
    status: result.error || result.status !== 0 ? "fail" : "pass",
    ms: Date.now() - started,
    output,
    detail: result.error ? String(result.error.message || result.error) : null
  };
}

function tail(output) {
  const lines = String(output || "").trimEnd().split("\n");
  return lines.slice(-TAIL_LINES).map((line) => `      ${line}`).join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const bash = resolveBash();
  const selected = options.only
    ? CHECKS.filter((check) => check.name.toLowerCase().includes(options.only.toLowerCase()))
    : CHECKS;

  if (options.list) {
    for (const check of CHECKS) console.log(`${check.runner.padEnd(4)} ${check.name}`);
    return 0;
  }
  if (selected.length === 0) {
    console.error(`No check matches "${options.only}". Run with --list to see the names.`);
    return 2;
  }

  console.log(
    `Running ${selected.length} contract check${selected.length === 1 ? "" : "s"}...\n`
  );
  const results = [];
  for (let index = 0; index < selected.length; index += 1) {
    const check = selected[index];
    const label = `[${index + 1}/${selected.length}] ${check.name}`;
    if (check.runner === "bash" && !bash) {
      results.push({ check, status: "skip", ms: 0, output: "", detail: "no working bash" });
      console.log(`${label} ... SKIP (no working bash)`);
      continue;
    }
    const result = runCheck(check, bash);
    results.push(result);
    console.log(
      `${label} ... ${result.status === "pass" ? "PASS" : "FAIL"} (${(result.ms / 1000).toFixed(1)}s)`
    );
    if (result.status === "fail") {
      console.log(`      ${check.runner} ${check.script}`);
      if (result.detail) console.log(`      ${result.detail}`);
      if (result.output.trim()) console.log(tail(result.output));
      console.log("");
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  if (failed.length > 0) {
    console.error(`\n${failed.length} check${failed.length === 1 ? "" : "s"} failed:`);
    for (const result of failed) console.error(`  - ${result.check.name}`);
  }
  if (skipped.length > 0) {
    console.error(
      `\n${skipped.length} check${skipped.length === 1 ? "" : "s"} could not run: no working bash.` +
        `\n  Install Git Bash or set COREZ_BASH to a shell that can run these scripts.` +
        `\n  A skipped check is not a pass, so this run is not green.`
    );
  }
  console.log(
    `\nSummary: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped` +
      ` (${(totalMs / 1000).toFixed(1)}s)`
  );

  return failed.length === 0 && skipped.length === 0 ? 0 : 1;
}

process.exit(main());
