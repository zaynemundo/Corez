/** Jest config for the native client. Preset: jest-expo (SDK 58). */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // jest-expo's preset ignores node_modules except Expo/React Native packages.
  // The shared CoreZ package is a local dependency copied into node_modules by
  // scripts/sync-shared.mjs and ships ESM, so it must be transformed too. The
  // markdown parser is ESM-only as well.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@corez_ai|marked))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/app/**",
    "!src/components/**",
    "!**/__tests__/**",
  ],
};
