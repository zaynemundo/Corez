# New-Corez

## Cloudflare Workers AI setup

Corez uses the native Cloudflare Workers AI binding for hosted text responses.
Public users send prompts to `/api/ai`; the Worker runs the fixed GLM-5.2 model
directly on Cloudflare and returns normalized response text.

Corez uses:

```text
@cf/zai-org/glm-5.2
```

The binding is declared in `wrangler.jsonc` as:

```jsonc
"ai": {
  "binding": "AI"
}
```

Native inference requires no provider API key, account ID, model variable, or
provider URL. The model is fixed server-side and cannot be overridden by public
users.

To run the optional quality evaluation against an existing deployment:

```bash
npm run evaluate:ai -- https://<deployed-worker-host>
```

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

## Cloudflare Worker deployment

Corez deploys the Vite SPA and `/api/ai` together as the `ai`
Cloudflare Worker. Configure the connected Worker build with:

Local Wrangler commands require Node.js 22+; Cloudflare Workers Builds currently defaults to Node.js 22.

```text
Build command: npm run build
Deploy command: npx wrangler deploy
Root directory: /
Production branch: main
```

The native `AI` binding is configured by `wrangler.jsonc`; hosted inference does
not require a runtime provider secret.
