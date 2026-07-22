### Task 5: Chat persistence, rendering, and refresh integration

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/ChatMessage.jsx`
- Modify: `tests/market-service.test.js`
- Modify: `tests/market-card.test.jsx`

**Interfaces:**
- Consumes: `generateAIResponse` string-or-market union and `fetchMarketData`.
- Produces stored market message: `{ role: 'assistant', type: 'market', content: '', request, market }`.
- Produces `handleRefreshMarket(messageIndex, nextRequest)` and passes it to `ChatMessage`.

- [ ] **Step 1: Add failing message-normalization and rendering tests**

Export a pure helper from `App.jsx`:

```js
export function toAssistantMessage(response) {
  if (typeof response === 'string') return { role: 'assistant', content: response };
  return { role: 'assistant', type: 'market', content: '', request: response.request, market: response.market };
}
```

Before implementing it, add these assertions:

```jsx
// tests/market-service.test.js
import { toAssistantMessage } from '../src/App.jsx';

expect(toAssistantMessage('Old answer')).toEqual({ role: 'assistant', content: 'Old answer' });
expect(toAssistantMessage({ type: 'market', request: { assetId: 'gold' }, market: { status: 'live' } })).toEqual({
  role: 'assistant', type: 'market', content: '', request: { assetId: 'gold' }, market: { status: 'live' }
});

// tests/market-card.test.jsx
import ChatMessage from '../src/components/ChatMessage.jsx';

render(<ChatMessage message={{ role: 'assistant', type: 'market', content: '', request, market }} onRunInCanvas={() => {}} onReviseCode={() => {}} onRefreshMarket={() => {}} marketRefreshing={false} />);
expect(screen.getByRole('region', { name: /Gold Spot market quote/i })).toBeInTheDocument();

render(<ChatMessage message={{ role: 'assistant', content: 'Old answer' }} onRunInCanvas={() => {}} onReviseCode={() => {}} onRefreshMarket={() => {}} marketRefreshing={false} />);
expect(screen.getByText('Old answer')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused tests to verify they fail**

```bash
npx vitest run tests/market-service.test.js tests/market-card.test.jsx
```

Expected: FAIL because the helper, market dispatch, and refresh prop do not exist.

- [ ] **Step 3: Normalize new and recovered assistant responses**

In both the normal send path and background recovery path in `src/App.jsx`, replace `responseText` handling with:

```js
const response = await generateAIResponse(apiPrompt, updatedApiMessages, controller.signal);
if (!response) return;
const aiMsg = toAssistantMessage(response);
if (aiMsg.type !== 'market') {
  const extractedCode = extractCodeFromMessage(aiMsg.content);
  if (extractedCode) setActiveCanvasCode(extractedCode);
}
```

Append `aiMsg` exactly as the existing text message is appended. Keep the pending-request payload free of credentials and preserve all existing abort/finally behavior.

- [ ] **Step 4: Add message refresh and ChatMessage dispatch**

Import `fetchMarketData` and `unavailableMarket` in `App.jsx`, add a `refreshingMarketKey` state, and implement:

```js
const handleRefreshMarket = async (messageIndex, nextRequest) => {
  const key = `${activeSessionId}:${messageIndex}`;
  setRefreshingMarketKey(key);
  try {
    const market = await fetchMarketData(nextRequest);
    setSessions((previous) => previous.map((session) => session.id !== activeSessionId ? session : { ...session, messages: session.messages.map((message, index) => index === messageIndex ? { ...message, request: nextRequest, market } : message) }));
  } catch (error) {
    setSessions((previous) => previous.map((session) => session.id !== activeSessionId ? session : { ...session, messages: session.messages.map((message, index) => index === messageIndex ? { ...message, request: nextRequest, market: unavailableMarket(error) } : message) }));
  } finally {
    setRefreshingMarketKey(null);
  }
};
```

Pass `onRefreshMarket={(nextRequest) => handleRefreshMarket(idx, nextRequest)}` and `marketRefreshing={refreshingMarketKey === `${activeSessionId}:${idx}`}` to `ChatMessage`.

In `ChatMessage.jsx`, import `MarketCard` and place this branch before Markdown rendering:

```jsx
{message.type === 'market' ? (
  <MarketCard market={message.market} request={message.request} onRefresh={onRefreshMarket} refreshing={marketRefreshing} />
) : (
  renderFormattedText(message.content)
)}
```

- [ ] **Step 5: Verify persistence compatibility and commit**

Run:

```bash
npx vitest run tests/market-service.test.js tests/market-card.test.jsx
npm run build
git add src/App.jsx src/components/ChatMessage.jsx tests/market-service.test.js tests/market-card.test.jsx
git commit -m "feat: render market responses in chat"
```

Expected: structured cards survive the existing localStorage serialization; old text messages still render; tests and build PASS.

---

