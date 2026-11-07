/** Jest config for the native client. Preset: jest-expo (SDK 58). */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/app/**",
    "!src/components/**",
    "!**/__tests__/**",
  ],
};
