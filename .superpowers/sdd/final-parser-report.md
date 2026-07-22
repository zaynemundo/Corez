# Final market-intent parser hardening

## Files changed

- `src/services/marketIntent.js`
- `tests/market-intent.test.js`

No Git index, commit, remote, secret, or out-of-scope file operation was performed.

## Behavior

- Uses span-based asset matching, target-currency exclusion, and distinct-asset checks instead of selecting the first catalog alias.
- Routes current price, quote, value, cost, worth, trading, `how much`, asset-to-fiat, and direct FX requests.
- Supports all approved catalog aliases, plural Bitcoin/Ether forms, punctuation and possessives, currency names/plurals, and `EUR/AED`-style direct pairs.
- Binds a quantity only inside the selected asset clause and rejects detached or extra unit quantities.
- Parses complete positive numeric tokens including `1,000`, `.5`, `10g`, and `10kg`; rejects signed, zero, scientific, fractional, and malformed numeric forms rather than consuming fragments.
- Preserves leading-decimal amounts in direct code/name/slash FX pairs without reopening partial-number matching.
- Requires `how much` to express a quote relationship or an immediate quantity/asset construction, and requires `convert` to match a numeric asset/currency conversion.
- Derives metal units only from the matched numeric quantity and evaluates repeated aliases for the same asset independently.
- Treats a `19xx`/`20xx` token as an amount only when the same parsed quantity span binds it to an asset or direct conversion; temporal uses still decline routing.
- Declines historical/future dates and horizons, weekdays, multiple assets, market cap/splits, product/creation prompts, company-product targets, physical-product wording, and ambiguous `price of apple` wording.
- Reverse `price`/`value`/`cost` requests validate the complete subject suffix, allowing only price-related currency, unit, range, stock/share, and current modifiers, including the legitimate trailing phrase `right now`.

## TDD evidence

- Review RED: 23 focused failures reproduced target-alias, direct-pair, punctuation/plural, future-time, detached-quantity, product, and Apple ambiguity defects.
- GREEN refinement found and fixed decimal clause scanning for `0.5 units of ETH`.
- Additional RED cycles covered worded/numbered future horizons and same-clause contamination/direct-FX ambiguity.
- Third review RED: 28 failures reproduced broad `how much`/`convert` routing, partial numbers, compact-unit loss, current-modifier, repeated-alias, company-product, and unit-leakage defects.
- Follow-up RED cycles covered grouped years/numbers, malformed fractions/decimals, conversion contamination, and unqualified reverse stock targets.
- Final exact RED: eight failures reproduced dropped `.5` direct-FX amounts and unchecked reverse-subject qualifiers.
- Trailing-phrase RED: four clean reverse/current quote variants using `right now` failed while qualified-subject regressions remained rejected.
- Final focused GREEN: `npx vitest run tests/market-intent.test.js` passed 183/183.

## Verification

- `npx vitest run tests/market-intent.test.js tests/market-service.test.js`: 290/290 passed.
- `npx eslint src/services/marketIntent.js tests/market-intent.test.js`: exit 0.
- `git diff --check -- src/services/marketIntent.js tests/market-intent.test.js .superpowers/sdd/final-parser-report.md`: exit 0.
- Warm-runtime probes at roughly 75k/150k/300k characters completed in approximately 34/36/64 ms for a forward quote suffix and 16/42/70 ms for a rejected reverse-subject suffix, consistent with linear scaling.

## Concerns

- The grammar is intentionally precision-biased: ambiguous multiple-asset, product, date/horizon, and unbound-number prompts continue through the normal AI path rather than producing a market card.
- Currency-name matching is deterministic and limited to the approved USD/AED/EUR/GBP/JPY vocabulary.
