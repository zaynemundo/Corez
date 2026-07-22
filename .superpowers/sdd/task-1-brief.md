### Task 1: Deterministic market catalog and intent parser

**Files:**
- Create: `src/services/marketCatalog.js`
- Create: `src/services/marketIntent.js`
- Create: `tests/market-intent.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `MARKET_ASSETS`, `DISPLAY_CURRENCIES`, `findAssetByAlias(value)`, and `getAssetById(id)` from `marketCatalog.js`.
- Produces: `parseMarketIntent(prompt)` returning `null` or `{ assetId, symbol, assetClass, currency, amount, unit, range, conversion }`.
- Consumes: no application service; this task is a pure deterministic boundary.

- [ ] **Step 1: Install the component-test dependencies and add scripts**

Run:

```bash
npm install --save-dev vitest@^3.2.4 jsdom@^26.1.0 @testing-library/react@^16.3.0 @testing-library/user-event@^14.6.1 @testing-library/jest-dom@^6.6.3
```

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test:market": "vitest run tests/market-intent.test.js tests/market-service.test.js tests/market-card.test.jsx && node tests/market-worker-contract.mjs",
    "test:market:watch": "vitest tests/market-intent.test.js tests/market-service.test.js tests/market-card.test.jsx"
  }
}
```

Expected: `package.json` and `package-lock.json` contain the pinned compatible dependency ranges; no production dependency is added.

- [ ] **Step 2: Write failing parser tests**

Create `tests/market-intent.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { DISPLAY_CURRENCIES, findAssetByAlias } from '../src/services/marketCatalog.js';
import { parseMarketIntent } from '../src/services/marketIntent.js';

describe('market catalog', () => {
  it('resolves names and tickers to one canonical asset', () => {
    expect(findAssetByAlias('gold').id).toBe('gold');
    expect(findAssetByAlias('XAU').symbol).toBe('XAU/USD');
    expect(findAssetByAlias('nvidia').symbol).toBe('NVDA');
    expect(findAssetByAlias('unknown')).toBeNull();
  });

  it('uses the approved currency allowlist', () => {
    expect(DISPLAY_CURRENCIES).toEqual(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
  });
});

describe('parseMarketIntent', () => {
  it.each([
    ['What is the price of gold?', 'gold', 'USD', 1, 'troy_ounce'],
    ['BTC price in AED', 'bitcoin', 'AED', 1, 'unit'],
    ['How much is 10 grams of gold in EUR?', 'gold', 'EUR', 10, 'gram'],
    ['AAPL quote', 'apple', 'USD', 1, 'unit'],
    ['NVIDIA stock price', 'nvidia', 'USD', 1, 'unit']
  ])('normalizes %s', (prompt, assetId, currency, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit });
  });

  it('parses a direct fiat conversion without guessing an asset', () => {
    expect(parseMarketIntent('Convert 100 EUR to AED')).toEqual({
      assetId: 'fx-eur',
      symbol: 'EUR/USD',
      assetClass: 'forex',
      currency: 'AED',
      amount: 100,
      unit: 'unit',
      range: '1D',
      conversion: { from: 'EUR', to: 'AED' }
    });
  });

  it.each([
    'Tell me about gold mining history',
    'Build a stock dashboard',
    'What is photosynthesis?',
    'Price of an unknownium token'
  ])('does not intercept %s', (prompt) => {
    expect(parseMarketIntent(prompt)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the parser test to verify it fails**

Run:

```bash
npx vitest run tests/market-intent.test.js
```

Expected: FAIL because `marketCatalog.js` and `marketIntent.js` do not exist.

- [ ] **Step 4: Implement the approved catalog**

Create `src/services/marketCatalog.js` with this complete data shape and lookup behavior:

```js
export const DISPLAY_CURRENCIES = Object.freeze(['USD', 'AED', 'EUR', 'GBP', 'JPY']);

export const MARKET_ASSETS = Object.freeze([
  { id: 'gold', name: 'Gold Spot', symbol: 'XAU/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['gold', 'xau', 'xau/usd'] },
  { id: 'silver', name: 'Silver Spot', symbol: 'XAG/USD', assetClass: 'metal', nativeCurrency: 'USD', defaultUnit: 'troy_ounce', aliases: ['silver', 'xag', 'xag/usd'] },
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['bitcoin', 'btc', 'btc/usd'] },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['ethereum', 'ether', 'eth', 'eth/usd'] },
  { id: 'solana', name: 'Solana', symbol: 'SOL/USD', assetClass: 'crypto', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['solana', 'sol', 'sol/usd'] },
  { id: 'apple', name: 'Apple', symbol: 'AAPL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['apple', 'aapl'] },
  { id: 'nvidia', name: 'NVIDIA', symbol: 'NVDA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['nvidia', 'nvda'] },
  { id: 'tesla', name: 'Tesla', symbol: 'TSLA', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['tesla', 'tsla'] },
  { id: 'microsoft', name: 'Microsoft', symbol: 'MSFT', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['microsoft', 'msft'] },
  { id: 'alphabet', name: 'Alphabet', symbol: 'GOOGL', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['alphabet', 'google', 'googl'] },
  { id: 'amazon', name: 'Amazon', symbol: 'AMZN', assetClass: 'stock', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['amazon', 'amzn'] },
  { id: 'fx-usd', name: 'US Dollar', symbol: 'USD/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['usd', 'us dollar', 'dollar'] },
  { id: 'fx-aed', name: 'UAE Dirham', symbol: 'AED/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['aed', 'uae dirham', 'dirham'] },
  { id: 'fx-eur', name: 'Euro', symbol: 'EUR/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['eur', 'euro'] },
  { id: 'fx-gbp', name: 'British Pound', symbol: 'GBP/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['gbp', 'british pound', 'pound sterling'] },
  { id: 'fx-jpy', name: 'Japanese Yen', symbol: 'JPY/USD', assetClass: 'forex', nativeCurrency: 'USD', defaultUnit: 'unit', aliases: ['jpy', 'japanese yen', 'yen'] }
]);

const byId = new Map(MARKET_ASSETS.map((asset) => [asset.id, asset]));
const byAlias = new Map(MARKET_ASSETS.flatMap((asset) => asset.aliases.map((alias) => [alias, asset])));

export function getAssetById(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function findAssetByAlias(value) {
  return byAlias.get(String(value || '').trim().toLowerCase()) || null;
}
```

- [ ] **Step 5: Implement the parser, rerun tests, and commit**

Create `src/services/marketIntent.js` with these exact rules:

```js
import { DISPLAY_CURRENCIES, MARKET_ASSETS } from './marketCatalog.js';

const REQUEST_WORDS = /\b(price|quote|rate|worth|cost|convert|conversion|how much)\b/i;
const MARKET_CONTEXT = /\b(stock|crypto|market|spot|forex|currency)\b/i;
const RANGE_PATTERN = /\b(1d|1w|1m)\b/i;
const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\b/;
const GOLD_UNITS = [
  [/\b(?:grams?|g)\b/i, 'gram'],
  [/\b(?:kilograms?|kilos?|kg)\b/i, 'kilogram'],
  [/\b(?:troy ounces?|ounces?|oz)\b/i, 'troy_ounce']
];

function findMentionedAsset(prompt) {
  const lower = prompt.toLowerCase();
  return MARKET_ASSETS
    .flatMap((asset) => asset.aliases.map((alias) => ({ asset, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => new RegExp(`\\b${alias.replace('/', '\\/').replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower))?.asset || null;
}

function requestedCurrency(prompt, fallback = 'USD') {
  const matches = [...prompt.toUpperCase().matchAll(/\b(USD|AED|EUR|GBP|JPY)\b/g)].map((match) => match[1]);
  return matches.at(-1) || fallback;
}

export function parseMarketIntent(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean || (!REQUEST_WORDS.test(clean) && !MARKET_CONTEXT.test(clean))) return null;

  const conversion = clean.match(/\b(?:convert\s+)?(\d+(?:\.\d+)?)\s*(USD|AED|EUR|GBP|JPY)\s+(?:to|in)\s+(USD|AED|EUR|GBP|JPY)\b/i);
  if (conversion) {
    const from = conversion[2].toUpperCase();
    const to = conversion[3].toUpperCase();
    if (!DISPLAY_CURRENCIES.includes(from) || !DISPLAY_CURRENCIES.includes(to)) return null;
    return { assetId: `fx-${from.toLowerCase()}`, symbol: `${from}/USD`, assetClass: 'forex', currency: to, amount: Number(conversion[1]), unit: 'unit', range: '1D', conversion: { from, to } };
  }

  const asset = findMentionedAsset(clean);
  if (!asset) return null;
  const explicitAmount = clean.match(NUMBER_PATTERN);
  const unit = asset.assetClass === 'metal'
    ? GOLD_UNITS.find(([pattern]) => pattern.test(clean))?.[1] || asset.defaultUnit
    : asset.defaultUnit;
  const range = clean.match(RANGE_PATTERN)?.[1]?.toUpperCase() || '1D';

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    assetClass: asset.assetClass,
    currency: requestedCurrency(clean),
    amount: explicitAmount ? Number(explicitAmount[1]) : 1,
    unit,
    range,
    conversion: null
  };
}
```

Run:

```bash
npx vitest run tests/market-intent.test.js
git add package.json package-lock.json src/services/marketCatalog.js src/services/marketIntent.js tests/market-intent.test.js
git commit -m "feat: parse supported market requests"
```

Expected: parser tests PASS; the commit contains no credential value.

---

