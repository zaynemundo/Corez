#!/usr/bin/env bash
set -euo pipefail

dataset="data/intents-dataset.json"
model="src/data/intent-classifier-model.json"
service="src/services/intentClassifier.js"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

# Task 1 & 2 structural file assertions
[[ -f "$dataset" ]] || fail "intent dataset exists"
node scripts/train-intents.mjs --validate-only || fail "dataset schema and balance pass"
[[ -f "$model" ]] || fail "compiled intent model exists"

# Task 2 determinism assertions
npm run train:intents || fail "intent training succeeds"
first_hash="$(sha256sum "$model" | cut -d' ' -f1)"
npm run train:intents || fail "intent retraining succeeds"
second_hash="$(sha256sum "$model" | cut -d' ' -f1)"
[[ "$first_hash" == "$second_hash" ]] || fail "model generation is deterministic"

# Check forbidden fields and paths in compiled model using explicit failing grep check
if grep -q '"trainedAt"' "$model"; then fail "model must not contain trainedAt"; fi
if grep -q '"generatedAt"' "$model"; then fail "model must not contain generatedAt"; fi
if grep -q '/workspaces/' "$model"; then fail "model must not contain absolute workspace paths"; fi

# Check required schema fields in model
grep -q '"schemaVersion": 1' "$model" || fail "model schemaVersion must be 1"
grep -q '"algorithm": "multinomial-naive-bayes"' "$model" || fail "model algorithm must be multinomial-naive-bayes"
grep -q '"tokenizer": "corez-intent-nfkc-unigram-bigram-v1"' "$model" || fail "model tokenizer must match spec"
grep -q '"minConfidence": 0.55' "$model" || fail "minConfidence must be 0.55"
grep -q '"maxOovRatio": 0.7' "$model" || fail "maxOovRatio must be 0.7"
grep -q '"trainingDataSha256"' "$model" || fail "trainingDataSha256 must be present"

# Task 3 offline evaluation assertions
evaluation_output="$(npm run evaluate:intents 2>&1)" || fail "offline evaluation succeeds"
grep -q '"passed":true' <<<"$evaluation_output" || fail "metric gates pass"

# Task 4 node inference & dataset validation test suite
node -e '
import { classifyIntent, tokenize } from "./src/services/intentClassifier.js";
import { analyzePublicUserIntent } from "./src/services/aiService.js";
import { validateDataset } from "./scripts/train-intents.mjs";
import fs from "node:fs";
import assert from "node:assert";

// Load dataset for validation tests
const validEntries = JSON.parse(fs.readFileSync("data/intents-dataset.json", "utf8"));

// Test dataset validation rules
assert.throws(() => validateDataset([]), /Dataset must contain exactly 250 entries/);

// Test invalid label on a clone of valid dataset (Defect 4 fix)
const invalidLabelEntries = JSON.parse(JSON.stringify(validEntries));
invalidLabelEntries[0].label = "invalid-label-type";
assert.throws(() => validateDataset(invalidLabelEntries), /Invalid label/);

// Representative prompts check
const testCases = [
  ["Create an invoice calculator I can use in the browser", "app"],
  ["Why does this React effect keep rendering forever?", "code-help"],
  ["Rewrite this launch email so it sounds confident", "writing"],
  ["Explain database indexes in plain English", "explanation"],
  ["I have a rough idea and need help deciding what to do", "general"]
];

for (const [prompt, expectedLabel] of testCases) {
  const result = classifyIntent(prompt);
  assert.strictEqual(result.label, expectedLabel, `Expected ${expectedLabel} for prompt: "${prompt}", got ${result.label}`);
  assert.strictEqual(result.accepted, true, `Classification should be accepted for prompt: "${prompt}"`);
}

// Multi-intent deliverable test
const multiApp = analyzePublicUserIntent("explain React state and build a counter");
assert.strictEqual(multiApp.type, "app", "Multi-intent deliverable with app should be app");

const multiCode = analyzePublicUserIntent("review this counter and explain why it breaks");
assert.strictEqual(multiCode.type, "code-help", "Multi-intent deliverable with code breakdown should be code-help");

// OOV / low confidence fallback check
const fallbackRes = analyzePublicUserIntent("xyzzy qwerty random gibberish 12345");
assert.strictEqual(fallbackRes.type, "general", "OOV prompt should fall back to general");
assert.ok(["rules", "default"].includes(fallbackRes.source), `Fallback source should be rules or default, got ${fallbackRes.source}`);

// Blank input test
const blankRes = analyzePublicUserIntent("   ");
assert.strictEqual(blankRes.type, "general", "Blank prompt should return general");

// Long input test (>512 tokens bound)
const wordStream = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(" ");
const tokens = tokenize(wordStream);
assert.ok(tokens.length <= 512, `Tokenizer must cap extracted tokens at 512, got ${tokens.length}`);
const longRes = classifyIntent(wordStream);
assert.ok(longRes.label, "Long prompt classification returned a label");

console.log("Runtime checks passed successfully!");
' || fail "Node runtime verification failed"

printf 'AI local intent classifier contract checks passed.\n'
