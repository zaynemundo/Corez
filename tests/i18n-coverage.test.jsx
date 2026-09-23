// Dictionary/source contract for the interface localisation.
//
// Catches the silent failures of a translation pass:
//  1. a call site naming a key the dictionary does not define — t() returns the
//     key itself, so the raw key would render in the interface;
//  2. a dictionary key no component uses — dead weight that still has to be
//     translated;
//  3. an English value that no longer matches the string that shipped before
//     localisation (a "helpful" rewording breaks every UI test that asserts the
//     original English).
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

// Source text with JSX entities decoded and whitespace collapsed, so a sentence
// wrapped over several lines (or written with a \n escape inside a template
// literal) still matches its dictionary value.
function normalise(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  // The dictionary is not a rewrite: every English value must be a string that
  // existed in the component BEFORE localisation. Comparing against git HEAD
  // (the last commit without i18n) is what catches an "improved" wording.
  const original = new Map();
  let gitAvailable = true;
  for (const file of FILES) {
    try {
      original.set(
        file,
        normalise(
          execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" }),
        ),
      );
    } catch (error) {
      const stderr = String(error?.stderr || "");
      if (/not a git repository|unknown revision|bad revision/i.test(stderr)) {
        gitAvailable = false;
        break;
      }
      // A file that HEAD does not contain is new (the i18n layer itself), so
      // there is no pre-localisation wording to compare it against.
    }
  }

  // Strings the localisation feature itself introduced (the language control and
  // the shell labels that came with it). They have no pre-i18n source.
  const NEW_KEYS = new Set([
    "common.shell.closeSidebar",
    "common.shell.openSidebar",
    "common.shell.streamingElsewhere",
    "common.shell.respondingIn",
    "common.shell.anotherChat",
    "common.shell.view",
    "common.shell.startNewConversation",
    "common.shell.responding",
    "common.shell.untitledApplication",
    "common.shell.expandStream",
    "common.shell.collapseStream",
    "common.shell.expandResponse",
    "common.shell.collapseResponse",
    "common.embed.notAllowed",
    "common.embed.cookieNotice",
    "common.embed.load",
    "common.embed.alwaysAllow",
    "settings.languageSection",
    "settings.language",
    "settings.languageHint",
  ]);

  // English values that the component assembles from expressions, so the
  // finished wording cannot appear literally in the pre-localisation source:
  // JSX plural suffixes (`purchase{count === 1 ? "" : "s"}`) and nested template
  // literals (`` `Game Over ${score !== null ? `- Score: ${score}` : ""}` ``).
  const BUILT_FROM_EXPRESSIONS = new Set([
    "settings.billing.purchaseSettledOne",
    "settings.billing.purchaseSettledOther",
    "consent.dialog.footOne",
    "consent.dialog.footOther",
    "canvas.game.overWithScore",
  ]);

  it("uses wording that already existed in the component", () => {
    if (!gitAvailable) {
      // A shallow clone or an archive without git history cannot answer this;
      // say so instead of pretending the check passed.
      console.warn("[i18n] git history unavailable — wording check skipped");
      return;
    }
    const haystack = [...original.values()].join(" ");
    const drifted = [];
    for (const area of DICTIONARY_AREAS) {
      for (const [key, value] of Object.entries(
        flattenDictionary(DICTIONARIES.en[area]),
      )) {
        const fullKey = `${area}.${key}`;
        if (NEW_KEYS.has(fullKey) || BUILT_FROM_EXPRESSIONS.has(fullKey)) continue;
        if (typeof value !== "string") continue;
        const segments = normalise(value)
          .split(/\{\w+\}/)
          .map((part) => part.trim())
          .filter((part) => part.length >= 6 && /[A-Za-z]/.test(part));
        if (segments.length === 0) continue;
        if (!segments.every((segment) => haystack.includes(segment))) {
          drifted.push(`${fullKey} → ${JSON.stringify(value)}`);
        }
      }
    }
    expect(
      drifted,
      `English wording differs from HEAD (was the string reworded?):\n${drifted.join("\n")}`,
    ).toEqual([]);
  });
});
