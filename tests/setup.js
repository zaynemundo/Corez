/**
 * Vitest global setup.
 *
 * Node >= 22 defines an experimental `localStorage` accessor on `globalThis`
 * that returns `undefined` unless the process runs with
 * `--localstorage-file`. Vitest treats it as a Node builtin and skips copying
 * the jsdom window's real `localStorage`, so every test that touches
 * `localStorage` (e.g. App session persistence) crashes with
 * "Cannot read properties of undefined". Provide a small in-memory Storage
 * implementation instead, which keeps tests hermetic in every environment.
 */

function createMemoryStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      const name = String(key);
      return store.has(name) ? store.get(name) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    }
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true
  });
}
