# Task 5 Report: Chat market persistence, rendering, and refresh

## Implementation

- Added a defensive `toAssistantMessage` normalization boundary for legacy string responses and structured market responses.
- Applied the same response union in normal sends and pending-request recovery while preserving text code extraction, session targeting, pending-request storage, abort handling, and existing finalization behavior.
- Routed structured messages through `MarketCard` before Markdown rendering; historical text messages retain their original `{ role, content }` shape.
- Added immutable exact-session/message refresh replacement, unavailable error mapping, silent `AbortError` handling, per-session/message busy keys, and unique refresh tokens so stale completions cannot overwrite newer requests even after an intervening refresh completes.
- Added focused helper, component dispatch, callback/busy, legacy localStorage, active-session-switch, and stale-race regression coverage.

## TDD evidence

- Initial RED: focused service/card run failed 10 intended assertions because message normalization helpers and `ChatMessage` market dispatch were absent.
- Initial GREEN: focused service/card run passed 49/49.
- Refresh race RED: the first stale-version test failed because guard helpers were absent.
- Token-reuse RED: the extended race test demonstrated that deleting an integer version could allow an older completion to match a later refresh after counter reuse.
- Final GREEN: `npm run test:market` passed 64/64 Vitest cases plus the Market Worker contract.

## Verification

- `npm run test:market`: PASS, 64/64 plus Market Worker contract.
- `bash tests/thinking-indicator-contract.sh`: PASS.
- Scoped ESLint for `src/App.jsx`, `src/components/ChatMessage.jsx`, and `tests/market-service.test.js`: PASS with zero warnings/errors. The repository ESLint configuration has no matching entry for `tests/**/*.jsx`, so `tests/market-card.test.jsx` remains outside configured lint coverage.
- Temporary-output Vite production build: PASS, 1,603 modules transformed; output was written under `/tmp`, leaving the existing dirty `dist` tree untouched.
- Scoped `git diff --check`: PASS.
- `tests/ui-responsive-contract.sh`: existing unrelated FAIL (10 sidebar/style assertions). Task 5 did not modify the unauthorized style/sidebar files, so those failures were not changed or claimed as passing.
- `package.json` has no generic `test` or `typecheck` script; these are reported as absent, not passed.

## Completion policy

- Local `main` commit only: `4dd32243 feat: render market responses in chat`.
- No fetch, push, deploy, or other remote action was performed, as explicitly required for this delegated task.

## Reviewer follow-up: stable refresh identity

- Local follow-up commit: `74e0f719 fix: stabilize market refresh identity`.
- Replaced message-index refresh identity with collision-resistant, serialized market-message IDs (`crypto.randomUUID`, with a Web Crypto random-byte fallback).
- Added load-time migration for legacy market messages without IDs and duplicate-ID repair while reserving every existing persisted ID before generation. Historical text messages remain byte-for-byte structurally unchanged.
- Refreshes now capture the origin `{ sessionId, messageId }`, update only a matching market message, and no-op when it was deleted. Reordering or deleting preceding messages cannot redirect a completion.
- Busy state is keyed independently per session/message. A per-App monotonic token sequence guards overlapping same-card requests; only the newest request may write or clear that card's busy state.
- The same identity/token guards cover success, sanitized unavailable errors, and aborts. `AbortError` preserves the prior card and clears only its own current pending state.
- Follow-up RED: 6 focused failures demonstrated absent IDs, index replacement, migration, and coordinator behavior. A separate migration collision RED showed a generated ID could otherwise claim a later persisted ID; existing IDs are now reserved first.
- Follow-up focused GREEN: 56/56 service/card cases pass, including real deferred out-of-order resolutions, concurrent-card busy sets, reorder/delete behavior, token non-reuse, error/abort handling, active-session switching, and legacy migration persistence across remount.
- Follow-up full verification: `npm run test:market` PASS (68/68 plus Market Worker contract), thinking-indicator contract PASS, scoped ESLint PASS, temporary-output Vite build PASS (1,603 modules), and scoped `git diff --check` PASS.
