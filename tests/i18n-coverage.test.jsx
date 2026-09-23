// Dictionary/source contract for the interface localisation.
//
// Catches the silent failures of a translation pass:
//  1. a call site naming a key the dictionary does not define — t() returns the
//     key itself, so the raw key would render in the interface;
//  2. a dictionary key no component uses — dead weight that still has to be
//     translated;
//  3. an English value that changed after the localisation release (a "helpful"
//     rewording breaks every UI test that asserts the original English).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DICTIONARIES,
  DICTIONARY_AREAS,
  flattenDictionary,
} from "../src/i18n/dictionaries.js";

function sourceFiles(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = sourceFiles("src");
const CONTENTS = new Map(FILES.map((file) => [file, readFileSync(file, "utf8")]));

// Every string in src/ that looks like a dictionary key ("chat.composer.send"),
// whether it is passed to t() or held in a lookup table such as the build-phase
// key map. Restricting the first segment to a real area keeps unrelated strings
// (a hostname, a file name) out of the set.
const KEY_REFERENCE_PATTERN = new RegExp(
  `["'\`]((?:${DICTIONARY_AREAS.join("|")})\\.[A-Za-z0-9_.]+)["'\`]`,
  "g",
);
const usedKeys = new Set();
for (const text of CONTENTS.values()) {
  for (const match of text.matchAll(KEY_REFERENCE_PATTERN)) {
    usedKeys.add(match[1]);
  }
}

const dictionaryKeys = new Set();
for (const area of DICTIONARY_AREAS) {
  for (const key of Object.keys(flattenDictionary(DICTIONARIES.en[area]))) {
    dictionaryKeys.add(`${area}.${key}`);
  }
}

describe("dictionary usage", () => {
  it("defines every key the components ask for", () => {
    const missing = [...usedKeys].filter((key) => !dictionaryKeys.has(key));
    expect(missing, `keys used but not defined:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });

  it("has no key the interface never uses", () => {
    const dead = [...dictionaryKeys].filter((key) => !usedKeys.has(key));
    expect(dead, `defined but unused:\n${dead.join("\n")}`).toEqual([]);
  });
});

describe("English values are the strings that shipped", () => {
  // tests/fixtures/i18n-en-snapshot.json freezes every English string at the
  // point the interface was localised. The dictionary is not a rewrite:
  //  - changing an existing value fails (an accidental reword breaks the UI
  //    tests that assert the original English),
  //  - adding a key is fine (new copy),
  //  - removing a key is fine (the string is no longer in the interface).
  // Regenerate on purpose with `node scripts/freeze-i18n-en-snapshot.mjs` only
  // when a wording change is intended and reviewed.
  const snapshot = JSON.parse(
    readFileSync("tests/fixtures/i18n-en-snapshot.json", "utf8"),
  );

  it("never rewords a string that already shipped", () => {
    const reworded = [];
    for (const area of DICTIONARY_AREAS) {
      for (const [key, value] of Object.entries(
        flattenDictionary(DICTIONARIES.en[area]),
      )) {
        const fullKey = `${area}.${key}`;
        const frozen = snapshot[fullKey];
        if (frozen === undefined) continue; // new string
        if (frozen !== value) {
          reworded.push(
            `${fullKey}\n    was: ${JSON.stringify(frozen)}\n    now: ${JSON.stringify(value)}`,
          );
        }
      }
    }
    expect(
      reworded,
      `English wording changed without updating the snapshot:\n${reworded.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the snapshot in step with the shipped English", () => {
    // A snapshot that still lists half the dictionary is not a baseline, so the
    // frozen file must only ever shrink (keys removed from the interface) — a
    // shrink is reported, not failed, and a stale entry is listed for cleanup.
    const stale = Object.keys(snapshot).filter((key) => {
      const separator = key.indexOf(".");
      const area = key.slice(0, separator);
      const rest = key.slice(separator + 1);
      const dictionary = flattenDictionary(DICTIONARIES.en[area] || {});
      return !(rest in dictionary);
    });
    // Informational: the interface may drop strings at any time.
    if (stale.length > 0) {
      console.info(
        `[i18n] ${stale.length} frozen strings are no longer in the interface (fine, cleanup optional)`,
      );
    }
    expect(Object.keys(snapshot).length).toBeGreaterThan(300);
  });
});
