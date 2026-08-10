---
name: r2-mem0-memory
description: Use for explicit persistent-memory operations through CoreZ R2 endpoints; require an unguessable user identifier, avoid sensitive data, and confirm successful storage or deletion before claiming it occurred.
---

# R2 Mem0 Persistent Memory Skill

Use this skill whenever storing, recalling, updating, searching, or forgetting long-term persistent user facts, preferences, project memory, entity graph state, or context across user sessions.

The memory engine uses Cloudflare R2 object storage (`ASSET_BUCKET`) via `/api/memory` endpoints to guarantee 0-database dependency long-term persistence.

## Security boundary

`/api/memory` is anonymous. The `userId` is the only access credential, so
anyone who knows it may read or delete that memory. Never use `default_user`
for durable personal memory. Require an unguessable per-user or per-session
identifier, never store credentials or sensitive personal data, and do not
describe this endpoint as authenticated user storage.

> Search is keyword-based (substring match over `text`, `key`, and `category`).
> The worker reports `embeddingStored: false` — there is no vector store in this
> repo, so treat the "semantic search" capability as keyword recall.

## Core Capabilities

1. **Memory Storage (`POST /api/memory/store`)**:
   - Store structured memory objects with optional `userId`, `key`, `category`, `text`, `tags`, and `metadata`.
   - Examples of categories: `preference`, `fact`, `entity`, `project`, `code_style`, `history`.
   - The API fallback is `userId` -> `default_user`, but callers must not rely
     on that shared identifier for durable memory. `key` is auto-generated and
     `text` (or `value`) is required.

2. **Memory Retrieval (`GET /api/memory/:userId`)**:
   - Retrieve all active long-term memories for a user or session.

3. **Keyword Memory Search (`POST /api/memory/search`)**:
   - Search relevant facts and context by query string or category filter for prompt injection into subagent context graphs.
   - Without a `query`, returns every memory for the user (optionally filtered by `category`).

4. **Memory Erasure (`DELETE /api/memory/:userId/:key`)**:
   - Forget or update outdated facts and preferences dynamically.

## Usage in Client Code

The client service wrapper (`src/services/r2MemoryService.js`) is not implemented
yet — call the worker endpoints directly with `fetch`:

```javascript
// Save user preference
await fetch('/api/memory/store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    key: 'theme_preference',
    category: 'preference',
    text: 'User prefers dark mode and concise code explanations.',
    tags: ['ui', 'theme']
  })
});

// Recall relevant memories for prompt context (keyword match)
const res = await fetch('/api/memory/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_123', query: 'dark mode' })
});
const { matches } = await res.json();
```

## API Specification

- `POST /api/memory/store`
  - Payload: `{ userId?: string, key?: string, category?: string, text: string, tags?: string[], metadata?: object }`
  - Response: `{ success: true, userId, key, r2Key, embeddingStored: false, record }`

- `POST /api/memory/search`
  - Payload: `{ userId?: string, query?: string, category?: string }`
  - Response: `{ userId, query, matches: MemoryRecord[], source: 'keyword' }`

- `GET /api/memory/:userId`
  - Response: `{ userId, memories: MemoryRecord[] }`

- `DELETE /api/memory/:userId/:key`
  - Response: `{ success: true, userId, key }`

## Verification

- Worker endpoints are covered by `tests/cloudflare-worker-contract.mjs`
  (store, search, list, delete, and path-traversal rejection). Run it via
  `npm run test:cloudflare`.
- Treat remember/forget as successful only after a 2xx response with the
  expected `success`, `userId`, and `key` fields.
