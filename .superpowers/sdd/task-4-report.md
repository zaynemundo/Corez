# Task 4 Report: Native market quote card

## Two-pass design plan

### Pass 1 — grounded direction

- **Subject / audience / job:** A trustworthy inline market instrument for ordinary COREZ chat users; its one job is to turn a price question into a legible, sourced indicative quote.
- **Palette:** Reuse COREZ's existing monochrome tokens: `Ink #000000`, `Panel #0D0D0D`, `Rule #292929`, `Paper #FFFFFF`, `Secondary #A1A1A6`, and `Muted #8E8E96`. Movement remains text-first (`Up` / `Down`) and never depends on green/red.
- **Type:** COREZ system sans (`Inter` / `SF Pro Text`) for names and controls, restrained tabular data styling for the quote, and `JetBrains Mono` for provider/time utility metadata. Task 4 supplies semantic class hooks only; Task 6 owns the actual CSS.
- **Layout:** A compact vertical instrument embedded in the assistant message: identity and status, quote and refresh, range and trend, selectors and local conversion, then provenance.

  ```text
  [Gold Spot / XAU/USD]                 [Market open]
  [$2,412.50] [Up 0.94% ($22.50)]          [Refresh]
  [1D] [1W] [1M]  ───────── trend ───────────────
  [Asset] [Currency]       [Quantity] [Unit]  = value
  Updated exact provider time · Source · Indicative disclaimer
  ```

- **Signature:** A single provenance rail closes the instrument with the exact provider timestamp, named source, and indicative-data disclaimer. It makes trust visible at the point of use rather than decorating the card.

### Pass 2 — critique and revision

The first pass risked the generic finance-card pattern of a dominant number, colored movement, ornamental sparkline, and a loose grid of stat chips. That pattern is too dashboard-like for a chat answer and can imply precision or actionability the product does not offer.

Revision: keep the large quote only because it is the requested answer, remove decorative stats/chips, make movement fully verbal, treat an empty series as a labeled empty trend rather than drawing invented geometry, and make stale/delayed/closed/unavailable states adjacent to the quote. The provenance rail becomes the only signature element. Controls remain native, plainly labeled, and grouped by whether they refresh provider data (asset/currency/range/manual retry) or calculate locally (quantity/unit). This structure is specific to a sourced chat quote and preserves COREZ's quiet monochrome UI.

## Implementation / verification

- Local commit: `2dde0df7 feat: add native market quote card` (implementation and test files only).
- Created `MarketCard.jsx` with semantic class hooks, native controls, an accessible chart, explicit movement/freshness/availability text, exact UTC provider time, source/disclaimer provenance, safe optional-data fallbacks, and local quantity/unit conversion.
- Created focused component coverage for quote provenance, movement and status wording, refresh request shapes, retry timing, unit conversion, empty/invalid quantities, empty charts, optional presentation data, and button/ARIA behavior.
- TDD RED: `npx vitest run tests/market-card.test.jsx` exited 1 because `MarketCard.jsx` did not exist.
- TDD GREEN: the focused component suite passes 11/11.
- Relevant intent/service/component regression suite passes 38/38.
- `src/components/MarketCard.jsx` passes scoped ESLint. The current ESLint config has no matching entry for `tests/**/*.jsx`, so ESLint reports the component test as ignored rather than linting it; this is reported as a configuration limitation, not a pass.
- Vite production build passes with output redirected to a temporary directory, leaving the user's pre-existing dirty `dist` files untouched.
- Scoped diff whitespace check passes.
- Task 6 still owns all CSS; no global style file was changed.
- No fetch, push, deploy, or other remote action was performed.

## Accessibility and edge-case follow-up

- Local fix commit: `3f8633c5 fix: harden market quote accessibility` (component and test only).
- Replaced the generic labeled price wrapper and hidden price fragments with visible semantic `<data>` text, so the exact formatted quote remains directly available to assistive technology.
- Added one named, atomic, polite market-status live region for refresh progress/completion and current open/delayed/stale/closed state; the card itself is not live. Unavailable messages now use alert semantics, while the unavailable region and retry button expose busy state and disable retry during an active request.
- Added neutral zero movement (`Unchanged 0.00%`) with a non-directional minus icon.
- Distinguished invalid quantity from unavailable quote/conversion data, and stopped inferring a missing quote currency from the request.
- Added regression coverage for semantic quote text, scoped announcements, busy/disabled controls, neutral movement, kilogram and stock/crypto unit math, non-finite and flat chart geometry, unavailable retry state, and missing/non-finite/invalid quote presentation fields.
- Follow-up RED: the expanded component suite failed nine cases against `2dde0df7`; a separate missing-currency regression then failed because the component inferred USD from the request.
- Follow-up focused GREEN: 23/23 component test cases pass.
- Fresh intent/service/component verification passes 50/50; scoped component ESLint passes with zero warnings; the temporary-output Vite build passes with 1,602 modules transformed; scoped whitespace diff check passes.
- The existing ESLint configuration still has no matching entry for `tests/**/*.jsx`, so the component test cannot be honestly reported as ESLint-checked.
- No fetch, push, deploy, or other remote action was performed for the follow-up.
