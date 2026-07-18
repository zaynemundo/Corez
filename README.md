# New-Corez

## OpenRouter AI setup

Corez uses a server-side OpenRouter proxy for real AI responses. Public users
do not need an API key; they send prompts to Corez, and Corez calls OpenRouter
from `/api/openrouter` with your private deployment secret.

By default, Corez uses:

```text
deepseek/deepseek-v4-flash
```

Set these server/deployment environment variables:

```text
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_REASONING_EFFORT
```

`OPENROUTER_MODEL` is optional. If it is not set, Corez uses DeepSeek V4 Flash.
`OPENROUTER_REASONING_EFFORT` is optional and defaults to `xhigh` for max
reasoning on supported OpenRouter models. Users can still override the model
name from Corez Settings, but they are not asked for an API key.

## Local Intent Training & Classification

Corez routes public user prompts using a deterministic local text classifier trained on a synthetic, reviewed dataset. This classifier operates entirely in-browser and requires no network calls, API keys, or external npm dependencies.

### Intent Taxonomy

Every prompt is classified into one of five deliverable-driven labels:

- `app`: Primary deliverable is an interactive web tool, app, game, calculator, timer, prototype, or dashboard.
- `code-help`: Primary deliverable is diagnosing, explaining, fixing, or refactoring code or technical errors.
- `writing`: Primary deliverable is drafting, rewriting, summarizing, or polishing prose.
- `explanation`: Primary deliverable is understanding or comparing concepts in plain language.
- `general`: Greetings, gratitude, advice, ambiguity, or requests without a specific deliverable.

### Training & Evaluation Commands

- **Train Model**: `npm run train:intents`
  Validates `data/intents-dataset.json` (250 synthetic examples, 50 per class split 40 train / 10 eval), trains a multinomial Naive Bayes model with Laplace smoothing ($\alpha = 1$), evaluates metric gates, verifies byte-for-byte determinism, and atomically updates `src/data/intent-classifier-model.json`.
- **Offline Evaluation**: `npm run evaluate:intents`
  Evaluates the committed model artifact against the 50 held-out evaluation examples without modifying the artifact, verifying metric gates:
  - Held-out Accuracy $\ge 0.90$
  - Macro F1 $\ge 0.88$
  - `app` Recall $\ge 0.90$
  - `code-help` Recall $\ge 0.90$

### Runtime & Fallback Behavior

`analyzePublicUserIntent(prompt)` uses the trained model when confidence $\ge 0.55$ and OOV (Out of Vocabulary) ratio $\le 0.70$. If confidence or OOV constraints are not met, Corez falls back to low-confidence regex pattern rules, ensuring resilient routing for novel or ambiguous prompts.

