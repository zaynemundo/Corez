import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../worker/index.js';
import { 
  storeMemoryInR2, 
  listUserMemoriesInR2, 
  searchMemoriesInR2, 
  deleteMemoryFromR2 
} from '../src/services/r2MemoryService.js';

describe('R2 Mem0 Persistent Memory Storage', () => {
  let memoryStore;
  let mockEnv;

  beforeEach(() => {
    memoryStore = new Map();
    mockEnv = {
      ASSET_BUCKET: {
        put: vi.fn(async (key, value) => {
          memoryStore.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
        }),
        get: vi.fn(async (key) => {
          if (!memoryStore.has(key)) return null;
          return {
            text: async () => memoryStore.get(key)
          };
        }),
        delete: vi.fn(async (key) => {
          memoryStore.delete(key);
        }),
        list: vi.fn(async ({ prefix }) => {
          const objects = [];
          for (const key of memoryStore.keys()) {
            if (key.startsWith(prefix)) {
              objects.push({ key });
            }
          }
          return { objects };
        })
      }
    };

    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const req = new Request(`http://localhost${url}`, options);
      const res = await worker.fetch(req, mockEnv);
      return res;
    }));
  });

  it('stores a memory record in R2 successfully', async () => {
    const res = await storeMemoryInR2('user_alpha', {
      key: 'pref_theme',
      category: 'preference',
      text: 'User prefers dark mode with high contrast accent colors.',
      tags: ['ui', 'theme']
    });

    expect(res.success).toBe(true);
    expect(res.userId).toBe('user_alpha');
    expect(res.key).toBe('pref_theme');
    expect(res.r2Key).toBe('memory/user_alpha/pref_theme.json');
    expect(mockEnv.ASSET_BUCKET.put).toHaveBeenCalled();
  });

  it('lists user memories from R2', async () => {
    await storeMemoryInR2('user_beta', {
      key: 'fact_1',
      text: 'User builds React applications with Vite.'
    });

    await storeMemoryInR2('user_beta', {
      key: 'fact_2',
      text: 'User prefers TailwindCSS for styling.'
    });

    const memories = await listUserMemoriesInR2('user_beta');
    expect(memories).toHaveLength(2);
    expect(memories.map(m => m.key)).toContain('fact_1');
    expect(memories.map(m => m.key)).toContain('fact_2');
  });

  it('searches relevant memories by query keyword', async () => {
    await storeMemoryInR2('user_gamma', {
      key: 'lang_1',
      category: 'coding',
      text: 'Loves TypeScript for backend Node.js microservices.'
    });

    await storeMemoryInR2('user_gamma', {
      key: 'lang_2',
      category: 'design',
      text: 'Prefers Figma for wireframing UI components.'
    });

    const matches = await searchMemoriesInR2('user_gamma', 'TypeScript');
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toBe('lang_1');
  });

  it('deletes a memory record from R2', async () => {
    await storeMemoryInR2('user_delta', {
      key: 'temp_key',
      text: 'Temporary session data to forget.'
    });

    const deleted = await deleteMemoryFromR2('user_delta', 'temp_key');
    expect(deleted).toBe(true);

    const memories = await listUserMemoriesInR2('user_delta');
    expect(memories).toHaveLength(0);
  });
});
