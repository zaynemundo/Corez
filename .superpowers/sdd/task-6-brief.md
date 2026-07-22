### Task 6: Responsive visual treatment and accessibility contracts

**Files:**
- Modify: `src/index.css`
- Modify: `tests/ui-responsive-contract.sh`
- Modify: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes the class names and ARIA structure from `MarketCard.jsx`.
- Produces no JavaScript interface.

- [ ] **Step 1: Add failing static and runtime accessibility checks**

Append to `tests/ui-responsive-contract.sh` checks for:

```bash
market_card="src/components/MarketCard.jsx"
check 'market card has a responsive grid' '\.market-controls' "$css"
check 'market card mobile controls collapse to one column' 'grid-template-columns:[[:space:]]*1fr' "$css"
check 'market card chart remains width-fluid' 'width:[[:space:]]*100%' "$css"
check 'market card respects reduced motion' '\.market-refresh' "$css"
check 'market card exposes a labelled region' 'role="region"' "$market_card"
check 'market movement includes words in addition to color' "\{up \? 'Up' : 'Down'\}" "$market_card"
check 'market disclosure identifies indicative data' 'Indicative data' "$market_card"
```

Append this runtime accessibility case to `tests/market-card.test.jsx`:

```jsx
it('exposes named controls that work from the keyboard', async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  render(<MarketCard market={market} request={request} onRefresh={onRefresh} refreshing={false} />);
  expect(screen.getByLabelText('Asset')).toBeInTheDocument();
  expect(screen.getByLabelText('Display currency')).toBeInTheDocument();
  expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
  expect(screen.getByLabelText('Unit')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /refresh market data/i })).toBeInTheDocument();
  await user.tab();
  expect(document.activeElement).not.toBe(document.body);
  await user.selectOptions(screen.getByLabelText('Display currency'), 'AED');
  expect(onRefresh).toHaveBeenCalledWith({ ...request, currency: 'AED', conversion: null });
});
```

- [ ] **Step 2: Run checks to verify they fail**

```bash
bash tests/ui-responsive-contract.sh
npx vitest run tests/market-card.test.jsx
```

Expected: responsive contract FAILS because market styles are absent.

- [ ] **Step 3: Add theme-aware card styles**

Append focused styles to `src/index.css` using existing tokens:

```css
.market-card { width: min(100%, 720px); display: grid; gap: 0.9rem; color: var(--text-primary); }
.market-card-header, .market-price-row, .market-card-footer { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.market-card-header strong, .market-price { display: block; }
.market-card-header span, .market-card-footer { color: var(--text-secondary); font-size: 0.75rem; }
.market-status { border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.2rem 0.45rem; font-size: 0.72rem; }
.market-status-stale, .market-status-delayed, .market-card-error { border-color: #f59e0b; }
.market-price { font-size: clamp(1.7rem, 5vw, 2.5rem); font-weight: 600; letter-spacing: -0.04em; }
.market-movement { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 500; }
.market-movement.up { color: #22c55e; }
.market-movement.down { color: #ef4444; }
.market-refresh, .market-ranges button { min-height: 38px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); }
.market-ranges { display: flex; gap: 0.4rem; }
.market-ranges button[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--text-primary); }
.market-chart { width: 100%; min-height: 160px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); }
.market-chart polyline { stroke: currentColor; stroke-width: 2; }
.market-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
.market-controls label { display: grid; gap: 0.3rem; color: var(--text-secondary); font-size: 0.75rem; }
.market-controls input, .market-controls select { width: 100%; min-height: 40px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); padding: 0.5rem 0.65rem; }
.market-conversion { font-size: 1.2rem; font-weight: 600; }
.market-card-footer { border-top: 1px solid var(--border-color); padding-top: 0.75rem; }
@media (max-width: 767px) { .market-controls { grid-template-columns: 1fr; } .market-card { gap: 0.75rem; } .market-price-row { align-items: flex-start; } }
@media (prefers-reduced-motion: reduce) { .market-refresh svg { animation: none !important; } }
```

Also ensure the containing AI message remains `max-width: 100%` and does not create horizontal scrolling at 320px.

- [ ] **Step 4: Run accessibility and responsive verification**

```bash
bash tests/ui-responsive-contract.sh
npx vitest run tests/market-card.test.jsx
npm run build
```

Expected: all checks PASS; no focus outline is removed.

- [ ] **Step 5: Commit the visual layer**

```bash
git add src/index.css tests/ui-responsive-contract.sh tests/market-card.test.jsx
git commit -m "feat: style accessible market cards"
```

---

