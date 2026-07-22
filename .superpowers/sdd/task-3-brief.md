### Task 3: Browser market service and market-first response union

**Files:**
- Create: `src/services/marketService.js`
- Create: `tests/market-service.test.js`
- Modify: `src/services/aiService.js`
- Modify: `tests/public-ai-proxy-contract.sh`

**Interfaces:**
- Consumes: `parseMarketIntent(prompt)` and `POST /api/market`.
- Produces: `fetchMarketData(request, signal)`.
- Produces: `generateAIResponse(...)` returning either the existing string or `{ type: 'market', request, market }`.
- The `market` field may be a successful normalized response or `{ kind: 'market', status: 'unavailable', error }`.

- [ ] **Step 1: Write failing service and interception tests**

Create `tests/market-service.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMarketData } from '../src/services/marketService.js';
import { generateAIResponse } from '../src/services/aiService.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchMarketData', () => {
  it('posts a normalized request to the market endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } }));
    vi.stubGlobal('fetch', fetchMock);
    const request = { assetId: 'gold', symbol: 'XAU/USD', assetClass: 'metal', currency: 'USD', amount: 1, unit: 'troy_ounce', range: '1D', conversion: null };
    await expect(fetchMarketData(request)).resolves.toMatchObject({ status: 'live' });
    expect(fetchMock).toHaveBeenCalledWith('/api/market', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });

  it('returns a safe structured error without inventing a price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'rate_limited', message: 'Market data rate limit reached.', retryAfter: 30 } }, { status: 429 })));
    await expect(fetchMarketData({ assetId: 'gold' })).rejects.toMatchObject({ code: 'rate_limited', retryAfter: 30 });
  });
});

describe('generateAIResponse market interception', () => {
  it('returns a market response without calling /api/ai', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/market') return Response.json({ kind: 'market', status: 'live', quote: { price: 2412.5 } });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAIResponse('What is the price of gold?')).resolves.toMatchObject({ type: 'market', request: { assetId: 'gold' }, market: { status: 'live' } });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai', expect.anything());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/market-service.test.js
```

Expected: FAIL because `marketService.js` is missing and `generateAIResponse` still calls hosted AI first.

- [ ] **Step 3: Implement the browser client**

Create `src/services/marketService.js`:

```js
export const MARKET_PROXY_ENDPOINT = '/api/market';

export class MarketApiError extends Error {
  constructor(code, message, status, retryAfter) {
    super(message);
    this.name = 'MarketApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function fetchMarketData(request, signal = null) {
  const response = await fetch(MARKET_PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MarketApiError(data?.error?.code || 'market_unavailable', data?.error?.message || 'Market data temporarily unavailable.', response.status, data?.error?.retryAfter);
  }
  return data;
}

export function unavailableMarket(error) {
  return { kind: 'market', status: 'unavailable', error: { code: error?.code || 'market_unavailable', message: error?.message || 'Market data temporarily unavailable.', ...(error?.retryAfter ? { retryAfter: error.retryAfter } : {}) } };
}
```

- [ ] **Step 4: Intercept before hosted AI and retire the hardcoded price response**

In `src/services/aiService.js`, import:

```js
import { parseMarketIntent } from './marketIntent.js';
import { fetchMarketData, unavailableMarket } from './marketService.js';
```

At the start of `generateAIResponse`, immediately after `cleanPrompt`:

```js
const marketRequest = parseMarketIntent(cleanPrompt);
if (marketRequest) {
  try {
    const market = await fetchMarketData(marketRequest, signal);
    return { type: 'market', request: marketRequest, market };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { type: 'market', request: marketRequest, market: unavailableMarket(error) };
  }
}
```

Delete the `MARKET_PATTERNS` branch from `generateLocalAIResponse` so no hardcoded market values or implicit financial-terminal HTML remain on the price-query path. Keep explicit app prompts such as “build a financial dashboard” working through app generation, but change any terminal badge or copy that claims hardcoded values are live to `DEMO DATA`.

Append these checks to `tests/public-ai-proxy-contract.sh`:

```bash
check 'frontend imports the deterministic market parser' 'parseMarketIntent' "$service"
check 'frontend imports the structured market client' 'fetchMarketData' "$service"
check 'market interception is evaluated in generateAIResponse' 'marketRequest[[:space:]]*=[[:space:]]*parseMarketIntent' "$service"
check_absent 'hardcoded gold quote is retired' '3,240[.]50|3240[.]50' "$service"
check_absent 'hardcoded bitcoin quote is retired' '66,259[.]00|66259[.]00' "$service"
check_absent 'local fallback does not claim a live snapshot' 'live market snapshot' "$service"
```

Add this order check below the static checks:

```bash
market_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /parseMarketIntent\(cleanPrompt\)/ { print NR; exit }' "$service")
hosted_line=$(awk '/export async function generateAIResponse/ { inside=1 } inside && /generateHostedAIResponse\(cleanPrompt/ { print NR; exit }' "$service")
if [ -z "$market_line" ] || [ -z "$hosted_line" ] || [ "$market_line" -ge "$hosted_line" ]; then
  printf 'FAIL: market interception must precede hosted AI\n' >&2
  failures=$((failures + 1))
fi
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run tests/market-intent.test.js tests/market-service.test.js
bash tests/public-ai-proxy-contract.sh
npm run build
git add src/services/marketService.js src/services/aiService.js tests/market-service.test.js tests/public-ai-proxy-contract.sh
git commit -m "feat: route market prompts before hosted ai"
```

Expected: tests and build PASS; built assets do not contain the old hardcoded quote text.

---

