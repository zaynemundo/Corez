const expoConfig = require("eslint-config-expo/flat");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  expoConfig,
  {
    // The TypeScript import resolver bundled with eslint-config-expo is loaded
    // through a hoisted eslint-module-utils that rejects its interface under
    // this dependency tree (Expo 58 + ESLint 9). The app does not rely on
    // import/* resolution rules, so use the plain node resolver and leave
    // unresolved path aliases to tsc.
    settings: {
      "import/resolver": {
        node: { extensions: [".js", ".jsx", ".ts", ".tsx", ".json"] },
      },
    },
    rules: {
      "import/no-unresolved": "off",
      "import/namespace": "off",
      "import/named": "off",
      "import/default": "off",
      "import/export": "off",
      // Every import/* rule that needs the resolver throws with the bundled
      // TypeScript resolver under this dependency tree. TypeScript's own
      // module resolution (tsc --noEmit) is the authority for imports here.
      "import/no-duplicates": "off",
    },
  },
  {
    ignores: ["dist/*", "node_modules/*", "android/*", "ios/*", ".expo/*"],
  },
]);
