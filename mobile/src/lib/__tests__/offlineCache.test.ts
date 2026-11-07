import { clearCache, readCache, removeCache, writeCache } from "../offlineCache";

let mockRows = new Map<string, { value: string; updatedAt: number }>();

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn((sql: string, ...params: unknown[]) => {
      if (sql.startsWith("DELETE FROM cache WHERE key")) {
        mockRows.delete(String(params[0]));
      } else if (sql.startsWith("DELETE FROM cache")) {
        mockRows.clear();
      } else if (sql.startsWith("INSERT OR REPLACE")) {
        mockRows.set(String(params[0]), {
          value: String(params[1]),
          updatedAt: Number(params[2]) || 0,
        });
      }
      return { changes: 1 };
    }),
    getFirstSync: jest.fn((sql: string, key: string) => {
      const row = mockRows.get(key);
      if (!row) return null;
      return { value: row.value, updated_at: row.updatedAt };
    }),
  })),
}));

beforeEach(() => {
  mockRows = new Map();
  clearCache();
});

describe("offline cache", () => {
  it("round-trips JSON values with a timestamp", () => {
    writeCache("chats", [{ id: "c1", title: "One" }]);
    const cached = readCache<{ id: string; title: string }[]>("chats");
    expect(cached?.value).toEqual([{ id: "c1", title: "One" }]);
    expect(cached?.updatedAt).toBeGreaterThan(0);
  });

  it("returns null for missing keys", () => {
    expect(readCache("missing")).toBeNull();
  });

  it("removes one key and clears all keys", () => {
    writeCache("a", 1);
    writeCache("b", 2);
    removeCache("a");
    expect(readCache("a")).toBeNull();
    expect(readCache("b")?.value).toBe(2);
    clearCache();
    expect(readCache("b")).toBeNull();
  });

  it("ignores corrupt stored JSON instead of throwing", () => {
    mockRows.set("broken", { value: "{not json", updatedAt: 1 });
    expect(readCache("broken")).toBeNull();
  });
});
