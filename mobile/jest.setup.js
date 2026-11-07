/**
 * Shared Jest setup.
 *
 * expo-secure-store is a native module with no implementation under Node, so
 * every test gets an in-memory keystore. Tests that need to inspect it read
 * `__store` off the mock.
 */
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});
