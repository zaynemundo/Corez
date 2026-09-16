---
name: creation-preview-publishing
description: Use when previewing a generated website or app in the sandbox iframe, storing creations in R2, publishing a share link, or debugging multi-page navigation and failed publishes. Not for visual design direction - use `frontend-design` instead.
---

# Creation Preview And Publishing

Use this skill for the operational path from generated HTML to the in-app
preview, R2 artifact storage, and a public share link. Use `frontend-design` for
visual direction and `game-development` for game mechanics.

## When to use

- The user asks to preview, save, store, or publish a generated website or app.
- You are wiring `src/components/CanvasPreview.jsx` or `src/services/appStorageService.js`.
- A published share link must stay stable across revisions from the same session.
- Publishing is blocked by a missing or malformed declared page.

## When not to use

- The user needs visual direction for the creation - use `frontend-design`.
- The creation is a game and the question is mechanics or levels - use `game-development`.
- The task is API contract or resilience work outside the `/api/apps` and `/api/publish` flow - use `backend-architecture`.
- The user wants a PDF or document deliverable rather than a hosted creation - use `pdf` or `data-documents`.

## Repository contract

- `src/components/CanvasPreview.jsx` renders generated documents in a sandboxed
  iframe. Preserve the existing sandbox and navigation guards.
- `src/services/appStorageService.js` stores session artifacts under
  `/api/apps` and publishes complete documents through `POST /api/publish`.
- `ASSET_BUCKET` is required for durable app storage and publishing.
- `/api/apps` is anonymous. A session identifier is the access credential, so
  use an unguessable value and never expose unrelated session data.
- Publishing is public. Only the formatted app document and validated page map
  belong in the payload; never include prompts, chat history, or session IDs.

## Workflow

1. Produce a complete HTML document that can run in an originless sandbox.
2. For multi-page output, use validated names matching
   `[a-z0-9][a-z0-9_-]{0,63}.html` and relative links between pages.
3. Preview every page and verify internal navigation before enabling publish.
4. Block publishing while any declared page is missing or malformed.
5. Reuse the same slug for revisions from the same session so a published link
   remains stable.
6. Treat publishing as complete only after `POST /api/publish` returns a 2xx
   response containing `success: true`, `slug`, and `url`, then open the URL.

## Guardrails

- Do not weaken iframe sandboxing, CSP, path validation, or payload size limits.
- Do not promise private sharing: anyone with the published URL can open it.
- Do not claim storage or publication succeeded after a local fallback, null
  response, 429, 530, or network failure.
- Do not publish an incomplete multi-page creation.

## Verification

Run `npx vitest run tests/app-r2-storage.test.js tests/canvas-preview-multipage.test.jsx tests/preview-navigation-guard.test.js` and `npm run test:cloudflare`.

## Related skills

- `frontend-design` - visual direction for the creation this flow previews and publishes.
- `game-development` - mechanics and playable-build concerns for game creations.
- `backend-architecture` - API contracts and resilience behind `/api/apps` and `/api/publish`.
