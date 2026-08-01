#!/usr/bin/env node
// Compares two vitest JSON reporter outputs and reports new/removed/changed tests.
// Usage:
//   node scripts/compare-test-results.mjs \
//     --baseline test-results/baseline/latest.json \
//     --current test-results/current/latest.json \
//     --output test-results/diff.json
// Exit code: 0 = no new failures, 1 = new failures detected.

import { readFileSync, writeFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { baseline: null, current: null, output: null };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--baseline') args.baseline = value;
    else if (key === '--current') args.current = value;
    else if (key === '--output') args.output = value;
  }
  return args;
}

function loadTests(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const tests = [];
  for (const file of raw.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      tests.push({ fullName: `${file.name} > ${a.fullName ?? a.title}`, status: a.status, file: file.name });
    }
  }
  return tests;
}

function indexBy(collection, keyFn) {
  return new Map(collection.map((item) => [keyFn(item), item]));
}

const { baseline: baselinePath, current: currentPath, output: outputPath } = parseArgs(process.argv);

if (!baselinePath || !currentPath) {
  console.error('Usage: node scripts/compare-test-results.mjs --baseline <b.json> --current <c.json> [--output <diff.json>]');
  process.exit(1);
}

const baseline = indexBy(loadTests(baselinePath), (t) => t.fullName);
const current = loadTests(currentPath);
const currentIndex = indexBy(current, (t) => t.fullName);

const added = [];
const removed = [];
const changed = [];
let same = 0;

for (const test of current) {
  const before = baseline.get(test.fullName);
  if (!before) {
    added.push({ fullName: test.fullName, status: test.status });
  } else if (before.status !== test.status) {
    changed.push({ fullName: test.fullName, before: before.status, after: test.status });
  } else {
    same += 1;
  }
}
for (const [name, before] of baseline) {
  if (!currentIndex.has(name)) removed.push({ fullName: name, status: before.status });
}

const newFailures = changed.filter((c) => c.after === 'failed');
const diff = {
  timestamp: new Date().toISOString(),
  baseline: baselinePath,
  current: currentPath,
  added,
  removed,
  changed,
  same,
  new_failures: newFailures.length,
  regression_verdict: newFailures.length > 0 ? 'FAIL — do not release' : 'PASS',
};

if (outputPath) writeFileSync(outputPath, JSON.stringify(diff, null, 2) + '\n');

console.log(`Test Results Diff:
  Passed: ${same} (unchanged)
  Added: ${added.length}
  Removed: ${removed.length}
  Failed: ${newFailures.length} (NEW — see below)
  Changed status: ${changed.length}`);
for (const f of newFailures) console.log(`  FAIL  ${f.fullName}`);
for (const f of changed.filter((c) => c.after !== 'failed')) console.log(`  ${f.before} -> ${f.after}  ${f.fullName}`);

process.exit(newFailures.length > 0 ? 1 : 0);
