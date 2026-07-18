# Local Intent Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train and integrate a deterministic local intent classifier that routes Corez prompts across five existing intent types and falls back to the current rules when confidence is insufficient.

**Architecture:** A curated, explicitly split JSON corpus feeds a dependency-free multinomial Naive Bayes trainer. The trainer validates and evaluates before atomically writing a stable JSON model; a focused browser module performs inference, while `aiService.js` retains the existing regex classifier as fallback.

**Tech Stack:** Node.js 24 ESM, React 18, Vite 6, JSON model artifact, Bash contract tests, Node built-in `fs`, `path`, `crypto`, and `url` modules.

## Global Constraints

- The corpus contains exactly 250 synthetic examples: 50 per class, with 40 training and 10 evaluation examples per class.
- Labels are exactly `app`, `code-help`, `writing`, `explanation`, and `general`.
- No external npm dependency, network call, API key, real user data, or secret is used in training or evaluation.
- Evaluation entries never affect vocabulary, priors, likelihoods, or thresholds.
- The generated artifact is byte-for-byte deterministic and contains no timestamp or environment-dependent path.
- Training writes the model only after every validation and metric gate passes.
- Existing intent object fields and regex fallback behavior remain compatible.
- AGY may modify only the files listed in the approved design specification.

---

### Task 1: Corpus Contract and Labeled Dataset

**Files:**
- Create: `tests/ai-local-intent-classifier-contract.sh`
- Create: `data/intents-dataset.json`

**Interfaces:**
- Produces: JSON array entries shaped as `{ "id": string, "text": string, "label": IntentLabel, "split": "train" | "evaluation" }`.
- Consumes: No earlier task output.

- [ ] **Step 1: Write the failing dataset contract test**

Create a Bash contract that first asserts the required files and package commands exist, then runs the eventual validator. Its executable assertions must include:

```bash
dataset="data/intents-dataset.json"
model="src/data/intent-classifier-model.json"

[[ -f "$dataset" ]] || fail "intent dataset exists"
node scripts/train-intents.mjs --validate-only || fail "dataset schema and balance pass"
[[ -f "$model" ]] || fail "compiled intent model exists"
```

It must also invoke `node scripts/evaluate-local-intents.mjs` and fail on any nonzero exit.

- [ ] **Step 2: Run the contract to verify it fails**

Run:

```bash
bash tests/ai-local-intent-classifier-contract.sh
```

Expected: nonzero exit because the dataset, trainer, evaluator, and model do not yet exist.

- [ ] **Step 3: Create the labeled corpus**

Use this exact entry schema and explicit split values:

```json
[
  {
    "id": "app-train-001",
    "text": "Build a booking page for my neighborhood barber shop",
    "label": "app",
    "split": "train"
  },
  {
    "id": "app-evaluation-001",
    "text": "Could you turn my meal plan into a small interactive tracker?",
    "label": "app",
    "split": "evaluation"
  }
]
```

Expand this to exactly 40 training and 10 evaluation entries for each label. Keep evaluation wording independently authored rather than paraphrased from training entries. Include direct, indirect, short, typo-bearing, overlapping, hard-negative, and deliverable-priority multi-intent examples.

- [ ] **Step 4: Verify structural counts independently**

Run a Node one-liner that parses the JSON, prints total and per-label/per-split counts, and exits nonzero unless the total is 250 and every class is `40/10`.

Expected output includes:

```text
total=250
app train=40 evaluation=10
code-help train=40 evaluation=10
writing train=40 evaluation=10
explanation train=40 evaluation=10
general train=40 evaluation=10
```

---

### Task 2: Deterministic Trainer and Model Artifact

**Files:**
- Create: `scripts/train-intents.mjs`
- Create: `src/data/intent-classifier-model.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `data/intents-dataset.json` entries from Task 1.
- Produces: `validateDataset(entries)`, `tokenize(text)`, `trainModel(entries)`, `classifyWithModel(text, model)`, `evaluate(model, entries)`, and stable serialized model JSON.

- [ ] **Step 1: Extend the failing contract for trainer guarantees**

Add assertions that `npm run train:intents` exists, two consecutive training runs leave the same SHA-256 digest, and the artifact excludes `trainedAt`, `generatedAt`, and absolute workspace paths.

```bash
npm run train:intents || fail "intent training succeeds"
first_hash="$(sha256sum "$model" | cut -d' ' -f1)"
npm run train:intents || fail "intent retraining succeeds"
second_hash="$(sha256sum "$model" | cut -d' ' -f1)"
[[ "$first_hash" == "$second_hash" ]] || fail "model generation is deterministic"
```

- [ ] **Step 2: Run the contract and confirm the new assertions fail**

Run `bash tests/ai-local-intent-classifier-contract.sh`.

Expected: nonzero exit because the trainer and package command are absent.

- [ ] **Step 3: Implement strict dataset validation**

`validateDataset(entries)` must reject non-arrays, unknown keys, duplicate IDs or normalized texts, blank IDs/text, invalid labels/splits, non-string values, wrong totals, missing classes, and any class whose train/evaluation counts are not `40/10`.

The label constant is:

```js
export const INTENT_LABELS = ['app', 'code-help', 'explanation', 'general', 'writing'];
```

- [ ] **Step 4: Implement deterministic tokenization and training**

Implement NFKC normalization, lowercase ASCII word extraction with internal apostrophes, adjacent bigrams prefixed with `bi:`, a 512-token bound, document-frequency filtering at two, and multinomial Naive Bayes with Laplace `alpha = 1`.

The serialized artifact must use this top-level schema in stable key order:

```json
{
  "schemaVersion": 1,
  "modelVersion": "1.0.0",
  "algorithm": "multinomial-naive-bayes",
  "tokenizer": "corez-intent-nfkc-unigram-bigram-v1",
  "alpha": 1,
  "labels": [],
  "vocabulary": [],
  "classDocumentCounts": {},
  "logPriors": {},
  "tokenLogLikelihoods": {},
  "minConfidence": 0.55,
  "maxOovRatio": 0.7,
  "trainingDataSha256": ""
}
```

Round model numbers to 12 decimal places before serialization. Hash canonical training entries sorted by ID. Do not include evaluation entries in the digest or fitted fields.

- [ ] **Step 5: Implement gated atomic output**

Support `--validate-only`. Normal execution validates, trains, performs held-out evaluation, checks all acceptance gates, verifies two in-memory serializations match, writes a sibling temporary file, then renames it to `src/data/intent-classifier-model.json`. Remove the temporary file on failure.

- [ ] **Step 6: Add the package command and train**

Add:

```json
"train:intents": "node scripts/train-intents.mjs"
```

Run `npm run train:intents`.

Expected: all metric gates pass and the deterministic artifact is created.

---

### Task 3: Offline Evaluator and Metric Reporting

**Files:**
- Create: `scripts/evaluate-local-intents.mjs`
- Modify: `tests/ai-local-intent-classifier-contract.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: trainer exports, the committed model artifact, and evaluation corpus entries.
- Produces: human-readable confusion matrix and per-class metrics plus a final single-line JSON summary.

- [ ] **Step 1: Add the failing evaluation assertions**

The contract must capture evaluator output and assert the JSON summary contains `accuracy`, `macroF1`, `appRecall`, `codeHelpRecall`, and `passed`.

```bash
evaluation_output="$(npm run evaluate:intents 2>&1)" || fail "offline evaluation succeeds"
grep -q '"passed":true' <<<"$evaluation_output" || fail "metric gates pass"
```

- [ ] **Step 2: Run the contract and confirm evaluator failure**

Expected: nonzero because `evaluate:intents` does not exist.

- [ ] **Step 3: Implement evaluation-only execution**

Load but never rewrite `src/data/intent-classifier-model.json`. Validate the dataset, confirm its training digest matches the artifact, classify only `split: "evaluation"` entries, and compute precision, recall, and F1 with zero-division returning zero.

The command fails unless:

```js
accuracy >= 0.90 &&
macroF1 >= 0.88 &&
perClass.app.recall >= 0.90 &&
perClass['code-help'].recall >= 0.90
```

- [ ] **Step 4: Add and run the package command**

Add:

```json
"evaluate:intents": "node scripts/evaluate-local-intents.mjs"
```

Run `npm run evaluate:intents`.

Expected: confusion matrix, five per-class metric rows, aggregate metrics, and final JSON with `"passed":true`.

---

### Task 4: Browser Runtime Classifier and Rule Fallback

**Files:**
- Create: `src/services/intentClassifier.js`
- Modify: `src/services/aiService.js`
- Modify: `tests/ai-local-intent-classifier-contract.sh`

**Interfaces:**
- Consumes: `src/data/intent-classifier-model.json`.
- Produces: `classifyIntent(prompt)` returning `{ label, confidence, oovRatio, accepted }`; `analyzePublicUserIntent(prompt)` continues returning `type`, `summary`, and `responseStrategy`, with optional `confidence` and `source`.

- [ ] **Step 1: Add failing runtime behavior checks**

Use Node 24 ESM imports in the contract to assert representative prompts for all five labels, an app/code multi-intent deliverable case, an OOV fallback case, whitespace input, and a prompt longer than 512 tokens.

Expected intent map:

```js
[
  ['Create an invoice calculator I can use in the browser', 'app'],
  ['Why does this React effect keep rendering forever?', 'code-help'],
  ['Rewrite this launch email so it sounds confident', 'writing'],
  ['Explain database indexes in plain English', 'explanation'],
  ['I have a rough idea and need help deciding what to do', 'general']
]
```

- [ ] **Step 2: Run the contract and verify the runtime checks fail**

Expected: import failure because `intentClassifier.js` is absent.

- [ ] **Step 3: Implement browser inference**

Import the JSON artifact with an import attribute. Reproduce the trainer tokenizer exactly, cap extracted words at 512, score classes in log space, normalize with stable softmax, and compute OOV ratio. Accept only when confidence is at least the model threshold and OOV ratio is at most its threshold.

```js
export function classifyIntent(prompt) {
  return { label, confidence, oovRatio, accepted };
}
```

- [ ] **Step 4: Integrate without deleting the fallback rules**

Rename the existing rule implementation to a private `analyzeIntentWithRules(cleanPrompt)`. `analyzePublicUserIntent()` first handles blank input, then calls the model; accepted model labels map through one canonical metadata object. Rejected results call the existing rules. Add `source: 'model' | 'rules' | 'default'` and the model confidence without changing the existing three required fields.

- [ ] **Step 5: Run focused contracts**

Run:

```bash
bash tests/ai-local-intent-classifier-contract.sh
bash tests/ai-public-intent-contract.sh
```

Expected: both pass.

---

### Task 5: Documentation, Compatibility, and Full Verification

**Files:**
- Modify: `README.md`
- Modify only if required by package metadata: `package-lock.json`

**Interfaces:**
- Consumes: all earlier task outputs.
- Produces: documented reproducible training and evaluation workflow.

- [ ] **Step 1: Document the actual training boundary**

Add a README section stating that Corez trains a local intent classifier, does not fine-tune the OpenRouter model, uses only synthetic committed examples, and requires no API key for `train:intents` or `evaluate:intents`. Document the five labels, commands, thresholds, deterministic artifact, and regex fallback.

- [ ] **Step 2: Run deterministic training and offline evaluation**

```bash
npm run train:intents
npm run evaluate:intents
```

Expected: both exit zero and report all gates passing.

- [ ] **Step 3: Run repository verification**

```bash
npm run lint
npm run build
for test in tests/*.sh; do bash "$test"; done
```

Expected: lint and build exit zero; every contract script reports pass.

- [ ] **Step 4: Review generated and source diffs**

Run `git diff --check`, inspect every changed file, confirm no secret-bearing paths or unexpected dependencies, and confirm a second `npm run train:intents` leaves `git diff` unchanged.

- [ ] **Step 5: Request independent diff review**

Delegate `ReviewDiff` to AGY only after implementation has stopped editing files. Resolve correctness, security, regression, test, and maintainability findings before completion.

