# AGY Intent Training Brief

Date: 2026-07-18
Mode: Analysis only
Reviewer: Codex

## Meaning of training

Train a local, deterministic intent classifier from a reviewed labeled dataset.
This does not fine-tune DeepSeek or any other model served by OpenRouter. The
compiled classifier runs in the browser before Corez sends the prompt and
structured intent to `/api/openrouter`.

## Training curriculum

The dataset contains informal, incomplete, and natural public-user prompts for
five mutually exclusive intent classes:

- `app`: requests to build a runnable site, app, tool, game, dashboard, widget,
  calculator, timer, prototype, or simulator.
- `code-help`: debugging, errors, stack traces, code explanations, and
  refactoring requests.
- `writing`: drafting, rewriting, summarizing, editing, and public-facing copy.
- `explanation`: requests to teach, compare, or explain a concept plainly.
- `general`: greetings, gratitude, ambiguous goals, open-ended planning, and
  prompts that do not reliably belong to another class.

The examples should cover direct requests, indirect phrasing, typos, short
prompts, overlapping vocabulary, and hard negatives. AGY proposed examples such
as a barber landing page (`app`), an unresponsive React button (`code-help`), a
product description (`writing`), an API-key explanation (`explanation`), and a
rough online-business idea (`general`). Codex requires enough examples per class
for a meaningful stratified held-out evaluation, not only these examples.

## Recommended implementation

Use a dependency-free text classifier compiled by a Node.js training script.
AGY proposed TF-IDF plus a probabilistic classifier; Codex selects multinomial
Naive Bayes for the bounded first version because its training and inference are
simple, deterministic, inspectable, and appropriate for a small curated corpus.

Primary model output is a committed JSON artifact containing schema version,
labels, vocabulary, class priors, token likelihoods, and confidence/fallback
thresholds. The artifact must not contain a generation timestamp or other
nondeterministic fields. Running training twice from the same dataset and
configuration must produce byte-identical output.

Low-confidence or high out-of-vocabulary prompts fall back to the existing
rule-based classifier, preserving current behavior while the learned classifier
is improved.

## Proposed files

- Create `data/intents-dataset.json` for reviewed labeled train/evaluation data.
- Create `scripts/train-intents.mjs` for deterministic training and evaluation.
- Create `src/data/intent-classifier-model.json` as the compiled model artifact.
- Modify `src/services/aiService.js` to perform model inference and retain the
  current regex fallback.
- Modify `package.json` to expose `train:intents` and an offline evaluation
  command.
- Add focused tests for artifact determinism, schema, classification behavior,
  held-out metrics, and fallback handling.
- Keep `scripts/evaluate-ai-intents.mjs` as the separate optional live
  OpenRouter response-quality evaluation.

## Acceptance criteria

- Training is local and requires no API key or network access.
- The dataset is stratified into fixed train and held-out evaluation partitions.
- Repeated training is byte-for-byte deterministic.
- Held-out overall accuracy is at least 90% and macro F1 is at least 0.88.
- Recall for `app` and `code-help` is at least 0.90.
- Existing intent response objects remain compatible with callers and the
  OpenRouter proxy.
- Low-confidence and high-OOV inputs use a tested fallback path.
- The full lint, build, contract-test, and training/evaluation suites pass.

## Dependencies and permissions

No new runtime or training dependency is required. Training uses Node.js built-in
modules and needs write access only to the explicitly authorized repository
files. Live OpenRouter evaluation remains optional and separately requires
`OPENROUTER_API_KEY`; that secret is not part of training and must never be
placed in the dataset, artifact, logs, or Git history.

## Risks

- A small or templated dataset can produce inflated metrics without real-world
  robustness.
- Ambiguous and multi-intent prompts need an explicit single-label policy.
- Training data must be reviewed to prevent private data, prompt injection, or
  label poisoning.
- Confidence from Naive Bayes is useful for routing but is not a calibrated
  probability and must not be represented as one to users.

