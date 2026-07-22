# Task 6 Report: Responsive market-card visual treatment

## Design discipline

### Pass 1: derive the visual system

- **Subject and job:** an inline market instrument for chat users who need to assess a provider-backed quote and its trust state without leaving the conversation.
- **Color:** reused COREZ's existing `--bg-*`, `--text-*`, and `--border-*` monochrome tokens. Added only semantic market tokens for positive (`#4ade80` dark / `#15803d` light), negative (`#f87171` dark / `#b91c1c` light), and caution (`#fbbf24` dark / `#92400e` light) states.
- **Type:** retained the existing COREZ system sans and mono choices. No typeface or font import was added. Prices and conversions use tabular numerals within the existing family.
- **Layout:** a compact two-column control grid on larger screens collapses to one column below 768px. Identity/status, quote/action, chart, controls, conversion, and provenance form a single vertical instrument that is width-fluid and bounded by its chat message.
- **Signature:** trust structure is the memorable element: restrained hairline rules frame textual market state, provider timestamp, source, and the indicative-data disclosure.

### Pass 2: critique and revision

- Rejected generic finance-card conventions: no gradient, neon glow, glossy surface, decorative KPI tiles, oversized pill badges, stock-photo artwork, or unrelated dashboard redesign.
- Kept status and movement understandable without color. Up, Down, Unchanged, Stale, Delayed, market-open/closed, delay duration, and unavailable states remain explicit text from the existing semantic markup.
- Spent visual emphasis on hierarchy and provenance instead of ornament. Semantic color is restrained to movement and caution borders; the chart and all surrounding structure stay monochrome.
- MiMo analysis-only delegation was attempted through the repository-prescribed AGY path. The sandboxed invocation could not create its listener/log, and the escalated invocation was rejected by the environment as an unapproved external data export. No workaround or data export was attempted; the bounded critique above was completed locally from the approved spec.

## Implementation

- Added theme-aware semantic market tokens and focused styles for every existing `MarketCard` hook.
- Added 44px minimum targets for refresh, retry, range, input, and select controls; explicit focus-visible outlines; hover-capability-gated hover states; disabled/busy presentation; and a reduced-motion override for the busy refresh icon.
- Made the card, chart, grid children, form controls, and containing assistant message shrink safely without horizontal overflow. Mobile controls stack at the existing 767px breakpoint and full-width refresh/retry actions remain usable at 320px.
- Preserved the existing screen-reader strategy: the component has no visually hidden helper text, so no unused screen-reader-only utility was introduced.
- Added market-specific static responsive/accessibility assertions and a runtime keyboard/control-name test adapted to the current Task 4 markup.

## TDD evidence

- Untouched baseline: `tests/ui-responsive-contract.sh` reported 10 existing sidebar failures. `tests/market-card.test.jsx` passed 28/28.
- RED after tests: the responsive contract reported the same 10 sidebar failures plus 7 intended market-style failures. The new runtime keyboard case passed because Task 4 had already supplied the correct semantic labels and native keyboard behavior.
- GREEN after CSS: all 7 market-specific failures were removed. The responsive contract still reports exactly the original 10 sidebar failures, with no new failure or masked assertion. The focused card suite passes 29/29.

## Verification

- `npm run test:market`: PASS, 69/69 Vitest cases plus the Market Worker contract.
- `npx vitest run tests/market-card.test.jsx`: PASS, 29/29.
- `tests/ui-responsive-contract.sh`: expected repository-baseline FAIL, exactly the same 10 unrelated sidebar assertions before and after Task 6; no market assertion fails post-change.
- Temporary-output Vite production build: PASS, 1,603 modules transformed; output written to `/tmp/corez-task6-build`, leaving the existing dirty `dist` tree untouched.
- Scoped `git diff --check`: PASS.
- Full `npm run lint`: existing unrelated FAIL in `scratch/update-icons.cjs` (`console`, two errors) and `worker/index.js` (unused assignment and undefined `process`, two errors). None of those files is in the Task 6 diff.
- Direct ESLint of `tests/market-card.test.jsx` reports that JSX tests are outside the repository's configured lint coverage (one ignored-file warning, no lint result claimed).

## Completion policy

- Local `main` commit: `87697718 feat: style accessible market cards`, containing only the three authorized tracked task files.
- Do not stage the scratch report, existing `dist` changes, or any unrelated file.
- No fetch, push, deploy, or other remote action.

## Reviewer follow-up: contrast, chart scaling, and contract rigor

- Replaced the explicit `--text-muted` declarations on `.market-refresh-state` and `.market-chart-empty` with `--text-secondary`. The selected token measures 5.07:1 against the light card background and 4.70:1 against light `--bg-secondary`; dark `--text-secondary` measures 7.56:1 against `--bg-card`. These exceed 4.5:1 for the 0.75rem text.
- Added `preserveAspectRatio="none"` to the accessible chart SVG so its 100-unit trace fills the fluid rendered width. The existing `vectorEffect="non-scaling-stroke"`, stable CSS height, `max-width: 100%`, and shrinkable wrapper preserve stroke weight and mobile containment.
- Strengthened the runtime keyboard contract to verify the card-local sequence from Refresh through range buttons and selectors, activate the 1W range with Enter, and verify the controlled currency request without depending on brittle full-page tab counts or unsupported jsdom native-select key emulation.
- Added a brace-depth-aware media-query contract helper. The mobile grid assertion now requires `.market-controls { grid-template-columns: 1fr; }` inside the existing `@media (max-width: 767px)` block. A mutation check that removed the mobile value produced the expected dedicated market failure while the unmodified file retained only the known sidebar baseline.
- Split touch-target checks across refresh, retry, ranges, inputs, and selects; added exact light-theme semantic overrides, direct contrast-token assertions, chart wrapper/max-width checks, and source/runtime SVG scaling assertions.
- Follow-up RED: responsive contract reported the 10 known sidebar failures plus 3 intended market failures; the focused runtime suite failed on the absent SVG scaling attribute (and demonstrated jsdom's lack of native select ArrowDown emulation before the keyboard case was adapted to a real range-button key activation).
- Follow-up GREEN: focused card suite passes 30/30; full market suite passes 70/70 plus the Market Worker contract; responsive contract returns to exactly the same 10 known sidebar failures with zero market failures.
- Scoped lint: configured ESLint passes for `src/components/MarketCard.jsx`; a separate JSX parser-only scoped run passes for `tests/market-card.test.jsx`, which remains outside the repository's configured JSX-test lint file set.
- Temporary-output production build passes with 1,603 modules transformed under `/tmp/corez-task6-review-build`; scoped diff check passes.
- Follow-up local `main` commit: `a2d91960 fix: harden accessible market card styling`; no fetch, push, deploy, or remote action.
