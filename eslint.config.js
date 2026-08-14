import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'artifacts/**', '.agents/skills/**', '.wrangler/**', 'deepseek-harness/**']
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'packages/**/*.{js,mjs}', 'scripts/**/*.mjs', 'vite.config.js', 'tests/**/*.{js,jsx,mjs}', 'scratch/**/*.{cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.node,
        WebSocketPair: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.serviceworker
      }
    }
  }
];
