// Freeze the current English dictionary as the wording baseline:
//   node scripts/freeze-i18n-en-snapshot.mjs
//
// tests/i18n-coverage.test.jsx compares every English value against
// tests/fixtures/i18n-en-snapshot.json. Adding a string is allowed (new key);
// CHANGING an existing value fails unless the snapshot is regenerated here on
// purpose — which is what keeps an accidental "improvement" during a later edit
// or translation pass out of the interface.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  DICTIONARIES,
  DICTIONARY_AREAS,
  flattenDictionary,
} from '../src/i18n/dictionaries.js';

const snapshot = {};
for (const area of DICTIONARY_AREAS) {
  for (const [key, value] of Object.entries(flattenDictionary(DICTIONARIES.en[area]))) {
    snapshot[`${area}.${key}`] = value;
  }
}

mkdirSync('tests/fixtures', { recursive: true });
writeFileSync(
  'tests/fixtures/i18n-en-snapshot.json',
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(`${Object.keys(snapshot).length} English strings frozen`);
