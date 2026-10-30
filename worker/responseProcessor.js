// COREZ Response Processor
// Reliability + continuity checks for /api/ai responses.

import { safeErrorDetail } from "./utils.js";
import { parse } from "acorn";
import {
  extractCodeBlocks,
  GAME_SIGNALS,
  checkGameRequirements,
  ensureGameChatBrief,
  ensureSiteChatBrief,
  analyzeProjectState,
  isModificationRequest,
  scoreContinuity,
  mergeProjectState,
} from "./responseContinuity.js";

export {
  extractCodeBlocks,
  GAME_SIGNALS,
  checkGameRequirements,
  ensureGameChatBrief,
  ensureSiteChatBrief,
  analyzeProjectState,
  isModificationRequest,
  scoreContinuity,
  mergeProjectState,
};

export const CONTINUATION_INSTRUCTION =
  "[CONTINUATION] Do NOT restart from the beginning. Do NOT repeat previous lines. Continue writing from the exact stopping point until the entire file/document is complete. Ensure all <script>, <body>, and <html> tags and markdown code blocks are properly closed.";

export const ANTI_REPEAT_CONTINUATION_INSTRUCTION =
  "[CONTINUATION] Your previous continuation repeated content from the beginning instead of continuing. The COMPLETE artifact so far is the assistant message above. APPEND ONLY the missing ending, continuing from the exact stopping point. Do NOT re-emit, restate, or summarize ANY part of the existing artifact. Output only the new ending, and close every open tag, brace, and markdown code block.";

const TRAILING_CONJUNCTIONS =
  /\b(and|but|or|so|because|then|that|which|with|while|when|if|after|before|by|to|of|in|on|for|as|at|from|into|onto|upon|using|via|plus|also|however|therefore|meanwhile|although|though|whereas)\s*$/i;
const TRAILING_OPENERS =
  /\b(such as|for example|for instance|in order to|so that|as well as|along with|together with|the following|in particular|including|especially|in addition|on the other hand|which means|meaning|using|inside|outside|across|through|towards?|during|among|between|under|above|below|around|within|without|unless|until|where|when|how|what|why|excluding|plus|about|beyond|despite|instead|regardless|to:|the:)\s*$/i;
const UNFINISHED_WORD = /[a-z0-9]$/i;

function stripFences(content) {
  return String(content || "")
    .replace(/```[\s\S]*?(```|$)/g, " FENCE ")
    .replace(/`[^`\n]*`/g, " ");
}

export function countFences(content) {
  const matches = String(content || "").match(/```/g);
  return matches ? matches.length : 0;
}

export function detectTruncation(content, options = {}) {
  const text = String(content || "");
  const signals = [];
  const stopReason =
    typeof options.stopReason === "string" ? options.stopReason : null;

  if (!text.trim()) return { truncated: true, signals: ["empty-response"] };
  if (countFences(text) % 2 === 1) signals.push("open-code-fence");

  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    const opens = (text.match(new RegExp(`\\${open}`, "g")) || []).length;
    const closes = (text.match(new RegExp(`\\${close}`, "g")) || []).length;
    if (opens > closes) signals.push(`unmatched-${open}${close}`);
  }

  // Check for unclosed script and style blocks
  const scriptOpens = (text.match(/<script\b[^>]*>/gi) || []).length;
  const scriptCloses = (text.match(/<\/script>/gi) || []).length;
  if (scriptOpens > scriptCloses) signals.push("unclosed-script-tag");

  const styleOpens = (text.match(/<style\b[^>]*>/gi) || []).length;
  const styleCloses = (text.match(/<\/style>/gi) || []).length;
  if (styleOpens > styleCloses) signals.push("unclosed-style-tag");

  // Check for document-like HTML missing its closing html tag
  const isHtmlDoc = /<!doctype\s+html|<html[\s>]/i.test(text);
  if (isHtmlDoc && !/<\/html>/i.test(text)) {
    signals.push("unclosed-html-root");
  }

  const proseView = text
    .replace(/```[\s\S]*?(```|$)/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  const openTags = proseView.match(/<([a-z][a-z0-9-]*)([^>]*)>/gi) || [];
  const unclosedByName = new Map();
  for (const tag of openTags) {
    const inner = tag.slice(1, -1);
    if (/\/\s*$/.test(inner)) continue;
    const nameMatch = inner.match(/^([a-z][a-z0-9-]*)/i);
    if (!nameMatch) continue;
    const tagName = nameMatch[1].toLowerCase();
    if (
      [
        "br",
        "hr",
        "img",
        "input",
        "meta",
        "link",
        "area",
        "base",
        "col",
        "embed",
        "source",
        "track",
        "wbr",
      ].includes(tagName)
    )
      continue;
    const tagStart = proseView.indexOf(tag);
    const before = tagStart > 0 ? proseView[tagStart - 1] : "";
    if (/[/:=('"`[]/.test(before)) continue;
    const rest = proseView.slice(tagStart + tag.length);
    if (!new RegExp(`</${tagName}\\s*>`, "i").test(rest)) {
      unclosedByName.set(tagName, (unclosedByName.get(tagName) || 0) + 1);
    }
  }
  const distinct = unclosedByName.size;
  const maxRepeats = Math.max(0, ...unclosedByName.values());
  const structuralSignals = signals.some(
    (s) => s.startsWith("open-code-fence") || s.startsWith("unmatched-"),
  );
  if (
    (distinct >= 2 && (structuralSignals || maxRepeats >= 2)) ||
    distinct >= 3 ||
    maxRepeats >= 3
  ) {
    for (const tagName of unclosedByName.keys())
      signals.push(`unclosed-html-${tagName}`);
  }

  // A trailing '#' may be an unclosed ATX heading. A trailing '|' is NOT
  // truncation evidence — it is a complete Markdown table row, and flagging
  // it fired spurious continuation rounds (re-streamed duplicate answers) on
  // every table-heavy reply.
  if (/[#]+\s*$/.test(text)) signals.push("ends-with-structure-mark");
  if (/\n\s*\d+[.)]\s*$/.test(text)) signals.push("unfinished-list-item");

  const prose = stripFences(text).replace(/\s+$/, "");
  if (prose.length > 40 && UNFINISHED_WORD.test(prose)) {
    if (TRAILING_CONJUNCTIONS.test(prose))
      signals.push("ends-with-conjunction");
    else if (/:\s*$/.test(prose)) signals.push("unfinished-list-intro");
    else if (TRAILING_OPENERS.test(prose)) signals.push("mid-sentence-cutoff");
  }

  // Dangling JS arithmetic, assignment or logical operators at the end of the text.
  // A single trailing '|' is a complete Markdown table row, not a dangling
  // bitwise-or — only a double '||' counts as an unfinished logical-or.
  const trimmed = text.trim();
  // A trailing '?' is ordinary prose punctuation ("What are you working
  // on?"), not a dangling ternary operator. Treating it as truncation made
  // every question-ending answer trigger a continuation, and the continuation
  // was stitched onto the complete reply.
  if (
    (/[+\-*%=&^~:;,([{/]\s*$/.test(trimmed) || /\|\|\s*$/.test(trimmed)) &&
    !/-->\s*$/.test(trimmed) &&
    !/\/>\s*$/.test(trimmed)
  ) {
    signals.push("dangling-expression-operator");
  }

  if (stopReason === "length") {
    // A provider 'length' stop is only truncation evidence when the text
    // ends mid-structure or mid-sentence. Ending at a clean boundary (final
    // punctuation, closing tag, or closed fence) means the output cap was
    // hit exactly at a complete unit — treating that as truncation spent up
    // to 12 continuation/repair calls on every clean cap hit.
    const tail = text.trimEnd();
    const endsClean = /[.!?"')\]}>\n]$/.test(tail) || /```\s*$/.test(text);
    if (!endsClean) signals.push("provider-stop-reason-length");
  }
  return { truncated: signals.length > 0, signals };
}

const NON_LATIN_RANGES = [
  /[\u0400-\u04FF]/g,
  /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g,
  /[\u0600-\u06FF\u0750-\u077F]/g,
  /[\u0900-\u097F\u0A00-\u0A7F\u0B00-\u0B7F]/g,
  /[\u0E00-\u0E7F\u0F00-\u0FFF]/g,
  /[\u0370-\u03FF\u1F00-\u1FFF]/g,
];

export function languageMismatchRatio(content) {
  const text = stripFences(String(content || ""));
  if (!text.trim()) return 0;
  const totalLetters = (text.match(/[\p{L}]/gu) || []).length;
  if (totalLetters < 20) return 0;
  let nonLatin = 0;
  for (const range of NON_LATIN_RANGES)
    nonLatin += (text.match(range) || []).length;
  return nonLatin / totalLetters;
}

export function detectLanguageMismatch(content, userPrompt = "") {
  const ratio = languageMismatchRatio(content);
  if (ratio < 0.5) return { mismatch: false, ratio };
  const prompt = String(userPrompt || "").toLowerCase();
  const explicitForeignTask =
    /\b(translate|translation|in (french|spanish|german|japanese|chinese|korean|russian|arabic|tagalog|filipino))\b/i.test(
      prompt,
    );
  return { mismatch: !explicitForeignTask, ratio };
}


export function checkBracketBalance(code) {
  const stack = [];
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let inString = null;
  let escaped = false;
  let prevSignificant = "";
  const startsRegex = (prev) => prev === "" || /[([=,:!&|?{;]/.test(prev);

  for (let i = 0; i < String(code || "").length; i += 1) {
    const char = code[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      if (char !== "`") {
        const lineEnd = code.indexOf("\n", i);
        const nextQuote = code.indexOf(char, i + 1);
        if (nextQuote === -1 || (lineEnd !== -1 && nextQuote > lineEnd)) {
          prevSignificant = char;
          continue;
        }
      }
      inString = char;
      prevSignificant = char;
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      prevSignificant = ";";
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i += 2;
      while (i + 1 < code.length && !(code[i] === "*" && code[i + 1] === "/"))
        i += 1;
      i += 1;
      prevSignificant = ";";
      continue;
    }
    if (
      char === "/" &&
      startsRegex(prevSignificant) &&
      !/\s/.test(code[i + 1] || "")
    ) {
      i += 1;
      let inClass = false;
      let closed = false;
      while (i < code.length) {
        const c = code[i];
        if (c === "\\") i += 1;
        else if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          closed = true;
          break;
        }
        i += 1;
      }
      if (closed) {
        i += 1;
        while (/[a-z]/i.test(code[i] || "")) i += 1;
        i -= 1;
      }
      prevSignificant = ";";
      continue;
    }
    if (char === "(" || char === "[" || char === "{") stack.push(char);
    else if (pairs[char]) {
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[char])
        return false;
      stack.pop();
    }
    if (!/\s/.test(char)) prevSignificant = char;
  }
  return stack.length === 0;
}

export function syntaxCheckJS(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return { ok: false, error: "empty code block" };
  const isJsx =
    /\breturn\s*\(?\s*<[A-Za-z]/.test(trimmed) || /<\/[A-Za-z]/.test(trimmed);
  const isModule = /\b(import\s|export\s|from\s+['"])/.test(trimmed);
  if (isJsx || isModule) {
    return checkBracketBalance(trimmed)
      ? { ok: true, checked: "brackets-only" }
      : { ok: false, error: "unbalanced brackets (jsx/module code)" };
  }
  try {
    // Parse with acorn rather than `new Function`: the same real parser used by
    // worker/jsSyntax.js. Compiling untrusted model output through the
    // Function constructor is flagged as unsafe even though the body is only
    // compiled and never invoked, and acorn reports the precise failure.
    parse(trimmed, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowHashBang: true,
    });
    return { ok: true, checked: "parse" };
  } catch (err) {
    return { ok: false, error: safeErrorDetail(err) || "syntax error" };
  }
}

export function validateHtmlDocument(content) {
  const text = String(content || "");
  const issues = [];
  const documentLike =
    /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(text);

  // Explanations often contain legitimate HTML fragments. Only require a full
  // <html> root when the block presents itself as a complete document.
  if (documentLike && (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text))) {
    issues.push("missing-html-root");
  }
  if (/<body[\s>]/i.test(text) && !/<\/body>/i.test(text))
    issues.push("unclosed-body-tag");

  const scriptOpens = (text.match(/<script[\s>]/gi) || []).length;
  const scriptCloses = (text.match(/<\/script>/gi) || []).length;
  if (scriptOpens !== scriptCloses) issues.push("unbalanced-script-tags");
  const divOpens = (text.match(/<div[\s>]/gi) || []).length;
  const divCloses = (text.match(/<\/div>/gi) || []).length;
  if (divOpens > divCloses) issues.push("unclosed-div-tags");
  return { ok: issues.length === 0, issues };
}


// Self-referential continuation meta-commentary that models sometimes emit
// when asked to continue an already-complete answer ("My previous reply was
// already complete — it was a single greeting sentence...", or the newer
// "continuation check" boilerplate: "No partial file or open document exists
// in this session...", "There is no prior partial file...", "Assuming you
// meant...", "## Continuation Status", "nothing further to append",
// "paste the partial content...", "I can't continue from a stopping
// point..."). Any such text is noise: strip from the first meta phrase to
// the end of the chunk.
//
// The pattern also covers the "document status" boilerplate models emit when
// a repair request hits an answer that already ends at a closing tag: "All
// tags are properly closed at the stopping point...", "You can open the
// previous output and use Print / Save as PDF directly", "No further lines
// to add", "your PDF file is already complete...". These fragments are pure
// narration — a file is not made complete by asserting that it is.
const META_COMMENTARY_PATTERN =
  /(?:(?:^|\n)##[^\n]{0,80}\n+)?(?:My (?:previous|prior) (?:reply|response|answer) was already (?:complete|finished)|The (?:previous|prior) (?:reply|response|answer) was already (?:complete|finished)|Your (?:previous|prior) (?:reply|response|answer) was already (?:complete|finished)|(?:The|This) (?:response|reply|answer) is already (?:complete|finished)|There (?:is|was) (?:no|nothing) (?:dangling|open|more|unfinished|partial) (?:file|code|tag|expression|block|content)|No continuation (?:is )?needed|Nothing (?:to|left to|more to) continu|No (?:partial|incomplete) (?:file|document|output|content)|There is no (?:prior |unfinished )?(?:partial )?(?:file|document|content|output|code block)|No open (?:document|file|content|conversation)[\s\S]{0,120}?(?:unfinished|remains|needed|to continue|to resume)|No prior (?:file|document|content|conversation) found|is left unfinished|(?:starting|start) from (?:your|the) stopping-point instruction|stopping-point instruction as the baseline|Assuming (?:you meant|the active file|no prior partial|the previous|the last|a complete)|I can'?t continue from a stopping point|Paste (?:your|the) partial|Provide the partial content|No active (?:partial|document|file|content|conversation)|None found (?:in the conversation|to resume|to continue|yet)|What to Provide to Resume|Required to Proceed|To proceed, please paste|#{1,3}\s*Continuation (?:Status|Check)|nothing (?:further|more|else) (?:to append|to add|can be appended)|no (?:stopping|stop) points? (?:to resume|for resuming) from|paste the (?:partial content|last lines)|continue directly from that exact|No (?:open|unclosed) [`<]|(?:Your |The )?(?:file|document|output|document file|code|content) is (?:already|fully) complete|(?:this|the) (?:file|document) ends? at (?:the )?previous|All (?:the )?(?:tags|sections|elements|blocks) are (?:properly |fully )?closed|All tags? and (?:markdown )?code blocks? are (?:properly |already )?closed|tags? (?:and|plus) (?:the )?(?:markdown )?code blocks? (?:are|is) (?:already|properly) closed|You can open (?:the )?previous (?:output|message|reply)|use Print \/ Save as PDF|Print \/ Save as PDF directly|No further lines? (?:to add|needed|are needed)|No (?:more|additional) lines? (?:to add|needed|are needed)|document ends at the previous closing tags?|(?:is|are) printable as-is|printable as-is|is complete (?:and printable|through to)|complete and properly closed|complete from the previous output|no missing lines|(?:is )?already closed and printable|Open (?:that|the full) (?:HTML|code) (?:block|output)[\s\S]{0,80}?(?:button|save it|save the|to save)|Press Ctrl\+P|\/ Cmd\+P|choose Destination: Save as PDF|in the chat above|from (?:two|three|the previous) messages? above|the closing code block|the closing [`]|closing code block|previous closing tags?)[^]*$/i;

export function stripMetaCommentary(text) {
  const value = String(text || "");
  const stripped = value.replace(META_COMMENTARY_PATTERN, "");
  // Only trim when a match was removed: untouched text stays byte-identical
  // (leading whitespace of a continuation chunk must survive for stitching).
  return stripped === value ? value : stripped.replace(/\s+$/, "");
}

// Meta fragments that start mid-sentence ("...</html> and the markdown code
// block is closed with ```. You can open...") are not caught by the anchored
// META_COMMENTARY_PATTERN above, so noise detection removes them first.
const META_BOILERPLATE_PATTERN =
  /(?:All tags? are properly closed at the stopping point|All (?:the )?(?:tags|sections|elements|blocks) (?:and (?:(?:the )?markdown )?code blocks? )?are (?:properly |fully |already )?closed|(?:tags?|sections|elements|blocks)(?:,? and)?[^.!?\n]{0,40}?(?:markdown\s+)?code\s+blocks?[^.!?\n]{0,20}?(?:are|is|were|was)[^.!?\n]{0,20}?(?:closed|complete)(?:\s+with\s+`{0,3}\s*\.?)?|You can open (?:the )?previous (?:output|message|reply)|use Print \/ Save as PDF|Print \/ Save as PDF directly|No further lines? (?:to add|needed|are needed)|No (?:more|additional) lines? (?:to add|needed|are needed)(?: — document ends at the previous closing tags?)?|document ends at the previous closing tags?|(?:is|are) printable as-is|is complete (?:and printable|through to|from the previous output)|complete and properly closed|no missing lines|(?:is )?already closed and printable|Open (?:that|the full) (?:HTML|code) (?:block|output)[\s\S]{0,80}?(?:button|save it|save the|to save)|Press Ctrl\+P|\/ Cmd\+P|choose Destination: Save as PDF|in the chat above|from (?:two|three|the previous) messages? above|the closing (?:code block|tags?)|previous closing tags?)/gi;

// Remove document-status narration from the END of a real answer. The
// anchored META_COMMENTARY_PATTERN only fires mid-text when the first meta
// phrase starts a sentence; the observed failure had a real deliverable
// first and the narration appended after it. This walks from the end and
// drops every trailing paragraph (newline-delimited, as the boilerplate
// arrives) whose every sentence is narration. Only the tail is touched:
// the first paragraph with real content (or any line inside the artifact)
// stops the walk and everything before it stays byte-identical.
export function trimMetaTail(text) {
  const value = String(text || "");
  const lines = value.split("\n");
  let end = lines.length;
  while (end > 1) {
    const line = lines[end - 1];
    if (isMetaParagraph(line)) {
      end -= 1;
      continue;
    }
    if (isMetaLine(line) || !line.trim()) {
      end -= 1;
      continue;
    }
    break;
  }
  if (end === lines.length) return value;
  return lines.slice(0, end).join("\n").replace(/\s+$/, "");
}

// True when a paragraph (one or more sentences) is entirely document-status
// narration: every sentence loses its meta fragments and nothing substantive
// remains. A single real content word is enough to keep the paragraph.
function isMetaParagraph(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  const sentences = value.split(/(?<=[.!?])\s+/);
  return sentences.every((sentence) => isMetaLine(sentence));
}

// Distinct closure markers. One marker may legitimately appear in a real
// answer ("the closing brace is on the last line"); a document-status
// narration line carries several of them ("tags ... closed ... code block
// ... print ... save as PDF"). Gaps are dot- and newline-tolerant because
// markup review lines embed ".</div>, </body>, </html>" sequences.
const META_MARKER_PATTERNS = [
  /\bclosing\s+`?<\/(?:div|body|html)>`?/i,
  /\b(?:markdown\s+|code\s+)?code\s+blocks?\b[^A-Za-z0-9]{0,30}?(?:are|is|were|was)\b[^A-Za-z0-9]{0,30}?(?:closed|complete)/i,
  /\b(?:tags?|sections?|elements?|blocks?)\b[^A-Za-z0-9]{0,40}?(?:are|is|were|was)\b[^A-Za-z0-9]{0,40}?(?:closed|complete)(?!\s+in\b|\s+on\b|\s+with\b|\s+by\b|\s+at\b)/i,
  /\b(?:is|are)\s+closed\s+with\b/i,
  /\bat the stopping[- ]point\b/i,
  /\b(?:stopping|stop)\s+points?\b/i,
  /\bno\s+(?:further|more|additional|missing)\s+(?:lines?|content|text)\b/i,
  /\bno\s+missing\s+lines?\b/i,
  /\bdocument\s+ends\s+at\s+the\s+previous\b/i,
  /\b(?:file|document)\s+(?:is|was)\s+(?:already|fully|now)?\s*(?:complete|finished|done|closed|printable)\b(?!\s+(?:in|on|with|by|at)\b)/i,
  /\b(?:is|are)\s+(?:fully\s+|already\s+)?printable\s+as-is\b/i,
  /\bprintable\s+as-is\b/i,
  /\bprint\s*\/\s*save\s+as\s+pdf\b/i,
  /\bpress\s+(?:ctrl|cmd)\s*\+\s*p\b/i,
  /\bchoose\s+destination\b/i,
  /\b(?:you\s+can\s+open|open)\s+(?:the\s+)?previous\s+(?:output|message|reply)\b/i,
  /\bprevious\s+(?:output|message|reply|response|closing\s+tags?)\b/i,
  /\b(?:in\s+the\s+chat|from\s+(?:two|three|the\s+previous)\s+messages?)\s+above\b/i,
  /\bcomplete\s+and\s+properly\s+closed\b(?!\s+in\b|\s+on\b|\s+with\b|\s+by\b|\s+at\b)/i,
  /\balready\s+closed\s+and\s+printable\b/i,
  /\bproperly\s+closed\s+at\s+the\s+stopping\s+point\b/i,
  /\bno\s+(?:further|more)\s+lines?\s+(?:to\s+add|needed|are\s+needed)\b/i,
  /\b(?:my|the|your)\s+(?:previous|prior)\s+(?:reply|response|answer)\s+(?:is|was)\s+already\s+(?:complete|finished)\b/i,
  /\b(?:the|this)\s+(?:response|reply|answer)\s+is\s+already\s+(?:complete|finished)\b/i,
  /\bno\s+continuation\s+(?:is\s+)?needed\b/i,
  /\bnothing\s+(?:to|left\s+to|more\s+to)\s+continu/i,
];

// Words that survive marker stripping but carry no factual content. A line
// that keeps only these is narration rather than a real answer.
const META_RESIDUE_WORDS = new Set([
  "a", "an", "the", "and", "or", "plus", "with", "without", "of", "to", "in",
  "on", "at", "from", "for", "by", "as", "is", "are", "was", "were", "be",
  "been", "this", "that", "these", "those", "it", "its", "your", "you", "my",
  "our", "here", "there", "all", "any", "each", "every", "no", "not", "none",
  "nothing", "properly", "fully", "already", "now", "complete", "completed",
  "completing", "finishing", "finished", "done", "closed", "close", "open",
  "opened", "closing", "end", "ends", "ended", "point", "points", "stopping",
  "stop", "line", "lines", "needed", "add", "added", "adding", "further",
  "more", "additional", "missing", "printable", "print", "prints", "save",
  "pdf", "directly", "previous", "above", "below", "file", "files",
  "document", "documents", "output", "message", "messages", "reply",
  "replies", "response", "answer", "code", "codes", "block", "blocks", "tag",
  "tags", "section", "sections", "element", "elements", "markdown", "button",
  "chat", "press", "ctrl", "cmd", "choose", "destination", "html", "as-is",
  "can", "could", "would", "should", "will", "may", "might", "do", "does",
  "did", "so", "then", "than", "but", "however", "therefore", "thus", "hence",
  "just", "only", "even", "also", "too", "very", "up", "down", "out", "over",
  "under", "into", "onto", "upon", "proper", "correct", "right", "here",
]);

function isMetaLine(line) {
  const value = String(line || "").trim();
  if (!value) return true;
  // A line opening a real code fence is artifact, never narration.
  if (/^\s*```[a-zA-Z0-9+#-]+\s*$/.test(value)) return false;
  const markers = META_MARKER_PATTERNS.filter((pattern) =>
    pattern.test(value),
  ).length;
  if (markers >= 2) return true;
  if (markers === 0) return false;
  // One marker: narration only when nothing real survives removing it.
  const cleaned = META_MARKER_PATTERNS.reduce(
    (text, pattern) => text.replace(new RegExp(pattern.source, "gi"), " "),
    value,
  )
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\]\([^)]*\)/g, " ")
    .trim();
  if (!cleaned) return true;
  const words = (cleaned.match(/[A-Za-z][A-Za-z'_-]*/g) || []).map((word) =>
    word.toLowerCase(),
  );
  return words.every((word) => META_RESIDUE_WORDS.has(word));
}

export function isMetaOnlyReply(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  // A reply that opens a language-tagged code fence is producing a real
  // deliverable. A bare inline ``` mention ("the code block is closed with
  // ```.") is exactly the narration this guard exists to catch, so only the
  // opening-fence form disqualifies a reply.
  if (/^\s*```[a-zA-Z0-9+#-]+\s*\n/m.test(value)) return false;
  // A genuinely huge reply (a real tail) is never treated as commentary.
  if (value.length > 4000) return false;
  // The earlier single-sentence phrasings ("My previous reply was already
  // complete...") remain valid markers.
  if (
    META_COMMENTARY_PATTERN.test(value) &&
    META_BOILERPLATE_PATTERN.test(value)
  ) {
    return true;
  }
  // The whole reply must be self-referential: every sentence has to be
  // narration once the markers are removed. Legitimate content — a real
  // continuation, a code segment, or ordinary prose — keeps real words, and
  // exactly one such sentence is enough to keep the reply.
  const sentences = value.split(/(?<=[.!?])\s+/);
  return sentences.every((sentence) => isMetaLine(sentence));
}

// True when a continuation chunk regenerates the answer from the beginning
// instead of appending the missing ending: its head matches the original's
// head with no genuinely new tail. Stitching that would duplicate the whole
// reply in the stream, so callers must discard the chunk (anti-repeat once,
// then stop). A full repeat WITH a new tail is not a pure restart — the
// stitcher consumes the repeated head and appends only the tail.
export function isRestartedReply(original, continuation) {
  const norm = (s) =>
    String(s || "").replace(/\s+/g, " ").trim();
  const o = norm(original);
  const c = norm(continuation);
  if (o.length < 40 || c.length < 40) return false;
  if (!c.startsWith(o.slice(0, 60))) return false;
  // Repeat plus genuinely new material is progress, not a restart.
  if (c.startsWith(o)) return !c.slice(o.length).trim();
  return true;
}

export function stitchContinuationChunk(original, continuation) {
  const orig = String(original || "");
  let cont = String(continuation || "");

  if (!cont.trim()) {
    return { stitched: orig, deltaText: "", overlapLength: 0, restarted: false };
  }

  // A continuation that only narrates document status has nothing to append:
  // stitching it would put "All tags are properly closed..." after the real
  // deliverable. Treat it like an empty chunk.
  if (isMetaOnlyReply(cont)) {
    return { stitched: orig, deltaText: "", overlapLength: 0, restarted: false };
  }

  // 1. Strip redundant model introductory chatter if any
  cont = cont.replace(
    /^(?:Here is the continuation|Continuing from where it stopped|Continuing the code|Continuing code|Continuing|Here's the rest|Continued):\s*\n?/i,
    "",
  );

  // 1b. Strip trailing self-referential meta-commentary ("My previous reply
  // was already complete...") so it never pollutes the stitched answer.
  cont = stripMetaCommentary(cont);

  // 1c. Regeneration handling: the model re-emitted from the top instead of
  // continuing. A pure regeneration is discarded (stitched output would be
  // the whole reply twice); a full repeat WITH a new tail has only the tail
  // stitched so the new material is kept without duplicating the rest.
  const normText = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const origNorm = normText(orig);
  const contNorm = normText(cont);
  if (
    origNorm.length >= 40 &&
    contNorm.length >= 40 &&
    contNorm.startsWith(origNorm.slice(0, 60))
  ) {
    if (contNorm.startsWith(origNorm)) {
      const tail = contNorm.slice(origNorm.length);
      if (!tail.trim()) {
        return {
          stitched: orig,
          deltaText: "",
          overlapLength: 0,
          restarted: true,
        };
      }
      cont = tail;
    } else if (isRestartedReply(orig, cont)) {
      return {
        stitched: orig,
        deltaText: "",
        overlapLength: 0,
        restarted: true,
      };
    }
  }

  // 2. If original is inside an open markdown code block, and continuation opens a redundant markdown fence
  const origHasOpenFence = countFences(orig) % 2 === 1;
  if (origHasOpenFence) {
    // If continuation starts with a code fence like ```html or ```js, remove that opening fence line
    cont = cont.replace(/^```[a-zA-Z0-9_-]*\s*\n/, "");
  }

  // 3. Sliding window prefix overlap deduplication
  let overlapLength = 0;
  const maxSearch = Math.min(200, orig.length, cont.length);
  for (let len = maxSearch; len >= 3; len -= 1) {
    const endSlice = orig.slice(-len);
    if (cont.startsWith(endSlice)) {
      overlapLength = len;
      break;
    }
  }

  if (overlapLength === 0) {
    const origTrimmed = orig.replace(/\s+$/, "");
    const maxTrimmedSearch = Math.min(200, origTrimmed.length, cont.length);
    for (let len = maxTrimmedSearch; len >= 4; len -= 1) {
      const endSlice = origTrimmed.slice(-len);
      if (cont.startsWith(endSlice)) {
        overlapLength = len;
        cont = cont.slice(overlapLength);
        const stitched = origTrimmed + cont;
        return { stitched, deltaText: cont, overlapLength, restarted: false };
      }
    }
    // If no overlap and joining prose outside code, ensure word boundary spacing
    if (
      !origHasOpenFence &&
      /[a-zA-Z0-9,;:?!.]$/.test(orig) &&
      !/^\s/.test(cont) &&
      !/^[.?!]/.test(cont)
    ) {
      cont = " " + cont;
    }
  } else {
    cont = cont.slice(overlapLength);
  }

  const stitched = orig + cont;
  return { stitched, deltaText: cont, overlapLength, restarted: false };
}

function buildContinuationMessages(messages, originalContent, reason) {
  let reasonInstruction;
  if (reason.includes("missing-code")) {
    reasonInstruction =
      "Return the COMPLETE updated code for the existing project in the SAME framework and structure. Reuse the previous implementation and change only what the user requested; do not redesign or rewrite unrelated sections.";
  } else if (reason.includes("syntax-failure")) {
    reasonInstruction = `The code in your previous answer has a syntax error (${reason}). Return the COMPLETE corrected answer with the fixed code — same content, same framework, only the syntax corrected.`;
  } else {
    reasonInstruction = CONTINUATION_INSTRUCTION;
  }
  return [
    ...messages.filter((m) => m?.role === "system"),
    ...messages
      .filter((m) => m?.role === "user" || m?.role === "assistant")
      .slice(-4),
    { role: "assistant", content: originalContent },
    {
      role: "user",
      content: `[CONTINUATION] Your previous answer was incomplete (${reason}). ${reasonInstruction}`,
    },
  ];
}

export function mergeResponse(original, repair, reason) {
  if (!repair || !String(repair).trim()) return original;
  const repairText = String(repair).trim();
  // A continuation that is only document-status narration ("All tags are
  // properly closed...", "No further lines to add...") adds nothing: keep the
  // original instead of appending noise after the deliverable.
  if (isMetaOnlyReply(repairText)) return original;
  const originalText = String(original || "").replace(/\s+$/, "");
  const originalHead = originalText.slice(0, 120);
  if (
    repairText.slice(0, 120) === originalHead &&
    repairText.length <= originalText.length + 200
  )
    return originalText;
  if (
    reason === "wrong-language" ||
    reason === "language mismatch" ||
    reason.startsWith("syntax-failure") ||
    reason === "missing-code-for-modification"
  )
    return repairText;
  if (originalText.endsWith(repairText.slice(0, 30))) return originalText;

  if (typeof reason === "string" && reason.startsWith("truncation")) {
    return stitchContinuationChunk(originalText, repairText).stitched;
  }

  if (countFences(originalText) % 2 === 1) {
    if (repairText.startsWith("```")) {
      const lastFenceStart = originalText.lastIndexOf("```");
      return `${originalText.slice(0, lastFenceStart).replace(/\s*$/, "")}\n${repairText}`;
    }
    return `${originalText}\n${repairText}`;
  }
  if (/[a-z0-9,;:]$/.test(originalText) && !/^\s*[.?!]/.test(repairText))
    return `${originalText} ${repairText}`;
  return `${originalText}\n\n${repairText}`;
}

export async function processResponse(messages, content, options = {}) {
  const userPrompt = options.userPrompt || "";
  const project = options.project || null;
  const stopReason = options.stopReason || null;
  const maxRepairs = Number.isFinite(options.maxRepairs)
    ? options.maxRepairs
    : 2;
  const generate = options.generate;

  const priorAnalysis = analyzeProjectState(messages);
  const priorCode = priorAnalysis.blocks.map((b) => b.code).join("\n");
  const effectiveProject =
    project && project.framework && project.framework !== "unknown"
      ? { ...project, latestCode: project.latestCode || priorCode }
      : priorAnalysis.project.framework !== "unknown"
        ? priorAnalysis.project
        : null;
  const modificationRequest =
    options.isModification === true ||
    (options.isModification !== false &&
      isModificationRequest(userPrompt, effectiveProject));

  const diagnostics = {
    truncationDetected: false,
    truncationSignals: [],
    languageMismatch: false,
    languageRatio: 0,
    repaired: false,
    repairAttempts: 0,
    repairReasons: [],
    validation: null,
    continuity: null,
    missingCodeForModification: false,
    isModificationRequest: modificationRequest,
    stopReason,
  };

  let answer = String(content || "");
  let finalStopReason = stopReason;
  let attempts = 0;

  const validateCode = (text) => {
    const issues = [];
    for (const block of extractCodeBlocks(text)) {
      if (block.lang === "html") {
        const html = validateHtmlDocument(block.code);
        if (!html.ok) issues.push(`html:${html.issues[0]}`);
      } else if (["js", "javascript", "jsx"].includes(block.lang)) {
        const syntax = syntaxCheckJS(block.code);
        if (!syntax.ok) issues.push(`${block.lang}:${syntax.error}`);
      }
    }
    return issues;
  };

  const validate = (text) => {
    const truncation = detectTruncation(text, { stopReason: finalStopReason });
    const language = detectLanguageMismatch(text, userPrompt);
    const missingCode =
      modificationRequest &&
      effectiveProject &&
      effectiveProject.framework !== "unknown" &&
      extractCodeBlocks(text).length === 0;
    const syntaxIssues = validateCode(text);
    diagnostics.missingCodeForModification = missingCode;
    diagnostics.syntaxIssues = syntaxIssues;
    diagnostics.truncationDetected = truncation.truncated;
    diagnostics.truncationSignals = truncation.signals;
    diagnostics.languageMismatch = language.mismatch;
    diagnostics.languageRatio = language.ratio;
    return (
      truncation.truncated ||
      language.mismatch ||
      missingCode ||
      syntaxIssues.length > 0
    );
  };

  while (attempts < maxRepairs && validate(answer)) {
    if (typeof generate !== "function") break;
    attempts += 1;
    const truncation = detectTruncation(answer, {
      stopReason: finalStopReason,
    });
    let reason;
    if (diagnostics.missingCodeForModification)
      reason = "missing-code-for-modification";
    else if (diagnostics.syntaxIssues?.length)
      reason = `syntax-failure (${diagnostics.syntaxIssues.slice(0, 2).join("; ")})`;
    else if (truncation.truncated)
      reason = `truncation (${truncation.signals.join(", ")})`;
    else reason = "language mismatch";

    diagnostics.repairReasons.push(reason);
    diagnostics.repairAttempts = attempts;
    try {
      const repairResult = await generate(
        buildContinuationMessages(messages, answer, reason),
      );
      if (
        !repairResult ||
        typeof repairResult.content !== "string" ||
        !repairResult.content.trim()
      )
        break;
      if (isMetaOnlyReply(repairResult.content)) {
        // The model responded with self-referential meta-commentary ("My
        // previous reply was already complete...") instead of a continuation:
        // the original answer was complete and the truncation flag was a
        // false positive. Keep the original and stop repairing instead of
        // stitching the noise into the reply.
        answer = String(answer || "").trim();
        finalStopReason = "stop";
        break;
      }
      if (
        reason.startsWith("truncation") &&
        isRestartedReply(answer, repairResult.content)
      ) {
        // The model regenerated the answer from the top instead of appending
        // the missing ending (and the meta-only guard above did not catch
        // it). Stitching would duplicate the reply; further rounds just burn
        // calls, so keep the original and stop.
        answer = String(answer || "").trim();
        finalStopReason = "stop";
        break;
      }
      answer = mergeResponse(answer, repairResult.content, reason);
      diagnostics.repaired = true;
      // A successful continuation supersedes the original stop reason. Keeping
      // a stale "length" here made repaired answers fail the strict evaluator.
      finalStopReason =
        typeof repairResult.stopReason === "string"
          ? repairResult.stopReason
          : null;
    } catch (err) {
      console.warn("COREZ response repair failed:", safeErrorDetail(err));
      break;
    }
  }

  // Belt-and-braces: never deliver trailing self-referential continuation
  // meta-commentary in the final answer (both the mid-text anchor and the
  // trailing-sentence cleanup, which catches narration appended after a real
  // deliverable).
  answer = stripMetaCommentary(answer);
  answer = trimMetaTail(answer);

  // Guarantee: every game deliverable carries its 1-2 sentence chat brief.
  // If the model returned a bare code block, derive one deterministically.
  const beforeBrief = answer;
  answer = ensureGameChatBrief(answer, userPrompt);
  diagnostics.gameBriefInjected = answer !== beforeBrief;

  // Same guarantee for website/app deliverables (bare artifact, no preamble).
  // Game-like content is owned by the game brief above and passes through.
  const beforeSiteBrief = answer;
  answer = ensureSiteChatBrief(answer, userPrompt);
  diagnostics.siteBriefInjected = answer !== beforeSiteBrief;

  const finalTruncation = detectTruncation(answer, {
    stopReason: finalStopReason,
  });
  diagnostics.truncationDetected = finalTruncation.truncated;
  diagnostics.truncationSignals = finalTruncation.signals;
  diagnostics.stopReason = finalStopReason;
  diagnostics.languageMismatch = detectLanguageMismatch(
    answer,
    userPrompt,
  ).mismatch;
  diagnostics.languageRatio = languageMismatchRatio(answer);

  const blocks = extractCodeBlocks(answer);
  diagnostics.validation = {
    codeBlockCount: blocks.length,
    syntax: blocks
      .filter((b) => ["js", "javascript", "jsx", "html"].includes(b.lang))
      .map((b) => {
        if (b.lang === "html") {
          const html = validateHtmlDocument(b.code);
          return { lang: b.lang, ok: html.ok, issues: html.issues };
        }
        const syntax = syntaxCheckJS(b.code);
        return {
          lang: b.lang,
          ok: syntax.ok,
          issues: syntax.error ? [syntax.error] : [],
        };
      }),
  };
  const gameSignals = checkGameRequirements(blocks.map((b) => b.code));
  if (gameSignals.length > 0) diagnostics.validation.gameSignals = gameSignals;

  if (
    modificationRequest &&
    effectiveProject &&
    effectiveProject.framework !== "unknown"
  ) {
    diagnostics.continuity = scoreContinuity({
      project: effectiveProject,
      response: answer,
      userPrompt,
    });
    if (project) mergeProjectState(project, answer, userPrompt);
  }

  return { content: answer, diagnostics };
}
