/**
 * J-Space Lite - ship (register check)
 * Port of jspace.py ship from Tiger380/J-Space-Cognition-Suite-V3.6 (Apache-2.0)
 * Checks outgoing text for inner-register leakage before delivery.
 */

const INNER_ONLY = ["⇒", "⟹", "⟸", "∴", "∵", "⊆", "⊇", "∋", "??", "?!", "💀"];
const MARKERS = ["GRRR", "GAAAH", "PHEW", "I see meltdown", "DATA DATA", "I'M DROWNING"];

const CLAIM = /(?:\b(?:verified|confirmed|validated|tested|proven)\b|(?:已经验证|已验证|经验证|验证通过|已经确认|已确认|经确认|确认无误|已经测试|已测试|经测试|测试通过|已经证明|已证明|经证明))/i;
const COVERAGE = /(?:\b(?:all|each|every|cases?|inputs?|samples?|bounds?|boundaries|edges?|random(?:ized)?|files?|modules?|sections?|lines?|scenarios?|environments?|platforms?|datasets?|records?|routes?|commands?|branches?|ranges?|including|through|up\s+to|Windows|Linux|macOS|Chrome|Firefox|Safari)\b|\b(?:Python|Node(?:\.js)?)\s*\d|\bn\s*[<≤=]\s*\d|(?:覆盖|全部|所有|每个|每条|各条|每项|逐一|逐条|边界|上下限|上限|下限|输入|用例|文件|目录|模块|章节|区段|分段|行数|行号|场景|平台|环境|浏览器|数据集|记录|路径|路由|命令|分支|范围|包括|包含|至多|至少|最多|最少|随机|样本|样例|截至))/i;

const MARKDOWN_HEADING = /^\s{0,3}#{1,6}(?:\s|$)/;
const SETEXT_UNDERLINE = /^\s{0,3}(?:=+|-+)\s*$/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const MARKDOWN_LIST_ITEM = /^\s{0,3}(?:[-+*]|\d+[.)])\s+/;
const MARKDOWN_FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const THEMATIC_BREAK = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;

function markdownFencedLines(lines) {
  const fenced = new Set();
  let fenceChar = null;
  let fenceSize = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceChar === null) {
      const m = line.match(MARKDOWN_FENCE);
      if (!m) continue;
      const token = m[1];
      fenceChar = token[0];
      fenceSize = token.length;
      fenced.add(i);
      continue;
    }
    fenced.add(i);
    const closing = new RegExp(`^\\s{0,3}${escapeRegExp(fenceChar)}{${fenceSize},}\\s*$`);
    if (closing.test(line)) {
      fenceChar = null;
      fenceSize = 0;
    }
  }
  return fenced;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownStructuralLines(lines) {
  const structural = markdownFencedLines(lines);
  for (let i = 0; i < lines.length; i++) {
    if (structural.has(i)) continue;
    if (MARKDOWN_HEADING.test(lines[i]) || THEMATIC_BREAK.test(lines[i])) {
      structural.add(i);
    }
    if (
      i + 1 < lines.length &&
      !structural.has(i + 1) &&
      lines[i].trim() &&
      SETEXT_UNDERLINE.test(lines[i + 1])
    ) {
      structural.add(i);
      structural.add(i + 1);
    }
    if (TABLE_DELIMITER.test(lines[i])) {
      let start = i - 1;
      while (start >= 0 && !structural.has(start) && lines[start].trim() && lines[start].includes("|")) {
        structural.add(start);
        start--;
      }
      let end = i;
      while (end < lines.length && !structural.has(end) && lines[end].trim() && lines[end].includes("|")) {
        structural.add(end);
        end++;
      }
    }
  }
  return structural;
}

function claimWithoutCoverage(lines) {
  const structural = markdownStructuralLines(lines);
  let paragraph = [];

  function flush() {
    if (!paragraph.length) return null;
    const joined = paragraph.map(([, l]) => l.trim()).join(" ");
    if (!CLAIM.test(joined) || COVERAGE.test(joined)) return null;
    for (const [num, line] of paragraph) {
      if (CLAIM.test(line)) return num;
    }
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || structural.has(i)) {
      const uncovered = flush();
      if (uncovered) return uncovered;
      paragraph = [];
      continue;
    }
    if (MARKDOWN_LIST_ITEM.test(line)) {
      const uncovered = flush();
      if (uncovered) return uncovered;
      paragraph = [[i + 1, line]];
    } else if (line.includes("|")) {
      const uncovered = flush();
      if (uncovered) return uncovered;
      paragraph = [[i + 1, line]];
      const inner = flush();
      if (inner) return inner;
      paragraph = [];
    } else {
      paragraph.push([i + 1, line]);
    }
  }
  return flush();
}

export function shipText(text) {
  const lines = text.split(/\r?\n/);
  const structural = markdownStructuralLines(lines);
  const prose = lines.filter((_, i) => !structural.has(i)).join("\n");

  const findings = [];

  const leaked = [...new Set(INNER_ONLY.filter((s) => prose.includes(s)))];
  if (leaked.length) {
    findings.push(`Dense notation in outgoing register (inner-only): ${leaked.join(" ")} — expand to plain language`);
  }

  const hot = [...new Set(MARKERS.filter((m) => prose.toLowerCase().includes(m.toLowerCase())))];
  if (hot.length) {
    findings.push(`state markers in outgoing text: ${hot.join(", ")}`);
  }

  const uncovered = claimWithoutCoverage(lines);
  if (uncovered) {
    findings.push(`line ${uncovered}: claim without coverage (verified/confirmed without all/each/bounds/…)`);
  }

  let run = 1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (structural.has(i) || structural.has(i + 1)) {
      run = 1;
      continue;
    }
    run = lines[i].trim() && lines[i].trim() === lines[i + 1].trim() ? run + 1 : 1;
    if (run >= 3) {
      findings.push("repetition loop: a line repeats three times or more");
      break;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (structural.has(i)) continue;
    if (/([.…\-'])\1{20,}/.test(lines[i])) {
      findings.push("repetition loop: a character run of 20 or more");
      break;
    }
  }

  return findings;
}

export function formatShipReport(findings) {
  if (!findings.length) return "clean — the outgoing register holds.";
  const header = "── j-space ─ ship";
  const body = findings.slice(0, 7).map((f) => `· ${f}`).join("\n");
  return `${header}\n${body}\n\nExpand the whole span into clean language before it ships. The switch is total, never cosmetic.`;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("fs");
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node ship.js <file> or - for stdin");
    process.exit(2);
  }
  let text;
  if (path === "-") {
    text = fs.readFileSync(0, "utf-8");
  } else {
    try {
      text = fs.readFileSync(path, "utf-8");
    } catch (e) {
      console.error(`CANNOT: ${path} (${e.message})`);
      process.exit(2);
    }
  }
  const findings = shipText(text);
  console.log(formatShipReport(findings));
  process.exit(0);
}
