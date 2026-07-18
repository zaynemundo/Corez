# Local Intent Training Design

## Purpose

Corez will replace regex-only intent routing with a locally trained text
classifier while retaining the current rules as a low-confidence fallback. This
work trains Corez's intent router; it does not fine-tune or alter the remote
DeepSeek model served through OpenRouter.

The trained classifier must be used by `analyzePublicUserIntent()` before Corez
builds either a local fallback response or an OpenRouter request.

## Intent Taxonomy

Every dataset entry has exactly one of these labels:

- `app`: the primary requested outcome is a runnable website, app, game, tool,
  dashboard, portal, widget, calculator, timer, prototype, or simulator.
- `code-help`: the primary requested outcome is diagnosing, explaining, fixing,
  testing, or improving source code or a technical error.
- `writing`: the primary requested outcome is drafted, rewritten, summarized,
  edited, or polished prose.
- `explanation`: the primary requested outcome is understanding or comparing a
  concept in plain language.
- `general`: greetings, gratitude, planning, advice, ambiguous requests, and
  requests whose primary outcome does not match another label.

For a multi-intent prompt, the label follows the requested deliverable. For
example, "explain React state and build a counter" is `app` because the concrete
deliverable is a runnable counter; "review this counter and explain why it
breaks" is `code-help` because diagnosis is the deliverable. Ambiguous cases
without a concrete deliverable are `general`.

## Training Corpus

Create `data/intents-dataset.json` containing exactly 250 synthetic, reviewed,
non-sensitive examples: 50 examples per class. Each class contains 40 entries
with `split: "train"` and 10 entries with `split: "evaluation"`. The split is
stored explicitly rather than generated randomly.

The corpus must cover:

- direct and indirect requests;
- short prompts and conversational sentences;
- casual wording, common typos, and incomplete grammar;
- overlapping vocabulary and hard negatives between classes;
- concrete domain variety rather than repeated templates;
- multi-intent examples labeled by the deliverable policy above;
- prompts with no recognized vocabulary for fallback evaluation.

Every entry has a stable unique `id`, a `text` string, one valid `label`, and one
valid `split`. Prompts must not contain real user data, secrets, credentials,
private repository content, or copied proprietary datasets.

## Training Algorithm

Create a dependency-free Node.js trainer implementing multinomial Naive Bayes.
The tokenizer performs Unicode NFKC normalization, lowercasing, and extracts
ASCII alphanumeric words with internal apostrophes. It creates unigram and
adjacent-bigram features and discards training features with document frequency
below two.

Training uses only entries marked `train`. Class priors and token likelihoods use
Laplace smoothing with `alpha: 1`. Labels and vocabulary are serialized in
lexicographic order, numeric values use fixed precision, and object keys are
written in stable order.

The committed model artifact is `src/data/intent-classifier-model.json` with:

- schema and model version;
- algorithm and tokenizer identifiers;
- ordered labels and vocabulary;
- per-class document counts, log priors, and token log likelihoods;
- smoothing value;
- `minConfidence: 0.55`;
- `maxOovRatio: 0.70`;
- the SHA-256 digest of the canonical training entries.

The artifact must not contain a generation time, environment-dependent path, or
other nondeterministic value. Two consecutive training runs against unchanged
input must produce byte-identical output.

## Runtime Classification

Move intent classification into a focused module so the trained-model inference
can be tested without invoking chat response generation. The module imports the
JSON artifact, applies the same tokenizer, calculates normalized class scores,
and returns the winning label, score, and OOV ratio.

`analyzePublicUserIntent(prompt)` preserves its existing public object contract:
`type`, `summary`, and `responseStrategy`. It may add diagnostic `confidence` and
`source` fields. It uses the model result only when confidence is at least 0.55
and OOV ratio is at most 0.70. Otherwise, it runs the existing regex rules. If no
rule matches, it returns `general`.

Empty or whitespace-only input returns `general` without throwing. Excessively
long input is classified from the first 512 extracted tokens so runtime work is
bounded. No prompt content or classification result is persisted by this
feature.

## Evaluation

The offline trainer evaluates only entries marked `evaluation`; these entries
must never contribute to vocabulary, priors, or likelihoods. It prints a
confusion matrix and per-class precision, recall, and F1, followed by overall
accuracy and macro F1.

Training exits nonzero and does not replace the committed artifact unless all
gates pass:

- overall held-out accuracy is at least 0.90;
- macro F1 is at least 0.88;
- `app` recall is at least 0.90;
- `code-help` recall is at least 0.90;
- all five labels occur in both splits;
- IDs are unique and schema validation passes;
- deterministic regeneration matches a second in-memory serialization.

The existing `scripts/evaluate-ai-intents.mjs` remains a separate optional live
OpenRouter response-quality check. Local training and evaluation require no API
key, network access, or provider account.

## Commands

Add these package scripts:

```text
npm run train:intents
npm run evaluate:intents
```

`train:intents` validates data, trains, evaluates, and atomically writes the
artifact only after every gate passes. `evaluate:intents` evaluates the existing
committed artifact without rewriting it. Both commands produce deterministic
machine-readable summary output in addition to the concise human report.

## Tests

Tests must cover dataset schema and balance, held-out isolation, tokenizer parity,
known examples for every label, ambiguous deliverable cases, confidence and OOV
fallback, empty and long prompts, artifact schema, byte-for-byte deterministic
training, required metric gates, and compatibility of the intent object sent to
`/api/openrouter`.

Independent verification runs:

```text
npm run train:intents
npm run evaluate:intents
npm run lint
npm run build
bash tests/ai-public-intent-contract.sh
bash tests/ai-live-intent-eval-contract.sh
bash tests/ai-local-intent-classifier-contract.sh
```

All existing repository contract scripts must also pass. A missing command or
test is a failure, not a pass.

## File Scope

AGY may create or modify only:

- `data/intents-dataset.json`
- `scripts/train-intents.mjs`
- `scripts/evaluate-local-intents.mjs`
- `src/data/intent-classifier-model.json`
- `src/services/intentClassifier.js`
- `src/services/aiService.js`
- `tests/ai-local-intent-classifier-contract.sh`
- `package.json`
- `package-lock.json` only if package metadata changes it
- `README.md`

AGY must not access environment files or secrets, change the OpenRouter provider,
modify unrelated UI behavior, add dependencies, or edit files outside this list.

## Security and Privacy

Training data and model artifacts are code-reviewed repository assets. Dataset
validation rejects unknown keys, invalid labels or splits, duplicates, blank
texts, and non-string content. User prompts remain untrusted input: tokenization
must be linear and bounded, and classification metadata must never be treated as
instructions. The private OpenRouter API key remains server-side and is not
needed or exposed by this workflow.

