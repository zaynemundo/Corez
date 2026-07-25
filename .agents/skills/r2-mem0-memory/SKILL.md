---
name: r2-mem0-memory
description: Mem0-style persistent long-term memory engine backed by Cloudflare R2 (ASSET_BUCKET) for storing, recalling, searching, and managing user preferences, session state, facts, entities, and conversation history across sessions.
---

# R2 Mem0 Persistent Memory Skill

Use this skill whenever storing, recalling, updating, searching, or forgetting long-term persistent user facts, preferences, project memory, entity graph state, or context across user sessions.

The memory engine uses Cloudflare R2 object storage (`ASSET_BUCKET`) via `/api/memory` endpoints to guarantee 0-database dependency long-term persistence.

## Core Capabilities

1. **Memory Storage (`POST /api/memory/store`)**:
   - Store structured memory objects with `userId`, `key`, `category`, `text`, `tags`, and `metadata`.
   - Examples of categories: `preference`, `fact`, `entity`, `project`, `code_style`, `history`.

2. **Memory Retrieval (`GET /api/memory/:userId`)**:
   - Retrieve all active long-term memories for a user or session.

3. **Semantic/Keyword Memory Search (`POST /api/memory/search`)**:
   - Search relevant facts and context by query string or category filter for prompt injection into subagent context graphs.

4. **Memory Erasure (`DELETE /api/memory/:userId/:key`)**:
   - Forget or update outdated facts and preferences dynamically.

## Usage in Client Code (`src/services/r2MemoryService.js`)

```javascript
import { 
  storeMemoryInR2, 
  listUserMemoriesInR2, 
  searchMemoriesInR2, 
  deleteMemoryFromR2 
} from '../services/r2MemoryService';

// Save user preference
await storeMemoryInR2('user_123', {
  key: 'theme_preference',
  category: 'preference',
  text: 'User prefers dark mode and concise code explanations.',
  tags: ['ui', 'theme']
});

// Recall relevant memories for prompt context
const relevantMemories = await searchMemoriesInR2('user_123', 'dark mode');
```

## API Specification

- `POST /api/memory/store`
  - Payload: `{ userId: string, key: string, category: string, text: string, tags?: string[], metadata?: object }`
  - Response: `{ success: true, userId, key, r2Key, record }`

- `POST /api/memory/search`
  - Payload: `{ userId: string, query?: string, category?: string }`
  - Response: `{ userId, query, matches: MemoryRecord[] }`

- `GET /api/memory/:userId`
  - Response: `{ userId, memories: MemoryRecord[] }`

- `DELETE /api/memory/:userId/:key`
  - Response: `{ success: true, userId, key }`
