import { stripJunkAfterDocumentEnd } from "../../utils/htmlRepair.js";
import {
  ensureLeadingPageMarker,
  findArtifactStartIndex,
} from "../../utils/previewTransformer.js";

// Multi-page markers the model may place INSIDE a fence or BETWEEN
// separate fenced blocks (one fence per page). Both placements must reach
// the preview as one multi-page artifact, so every extraction path below
// preserves these marker lines verbatim.
const MULTI_PAGE_MARKER_LINE_PATTERN =
  /^\s*<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\n>]+-->\s*$/gm;
const MULTI_PAGE_MARKER_ANY_PATTERN =
  /<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i;

export function extractCodeFromMessage(text) {
  if (!text) return null;

  const finish = (code) =>
    ensureLeadingPageMarker(stripJunkAfterDocumentEnd(code).trim());

  const codeBlocks = text.match(
    /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/gi,
  );
  if (codeBlocks) {
    const validCodes = [];
    for (const block of codeBlocks) {
      const match = block.match(
        /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/i,
      );
      if (match && match[1].trim()) {
        const code = match[1].trim();
        if (
          code.includes("<") ||
          code.includes("export default") ||
          code.includes("function ") ||
          code.includes("import ") ||
          code.includes("const ")
        ) {
          validCodes.push(code);
        }
      }
    }
    if (validCodes.length > 0) {
      const blocks = [];
      const gaps = [];
      let scanIdx = 0;
      const FENCE_BLOCK_PATTERN =
        /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*[\s\S]*?```/gi;
      let blockMatch;
      while ((blockMatch = FENCE_BLOCK_PATTERN.exec(text)) !== null) {
        const gap = text.slice(scanIdx, blockMatch.index);
        gaps.push(
          (gap.match(MULTI_PAGE_MARKER_LINE_PATTERN) || []).map((m) =>
            m.trim(),
          ),
        );
        const inner = blockMatch[0].match(
          /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*?)```/i,
        );
        blocks.push(inner && inner[1].trim() ? inner[1].trim() : "");
        scanIdx = blockMatch.index + blockMatch[0].length;
      }
      const tailMarkers = (
        text.slice(scanIdx).match(MULTI_PAGE_MARKER_LINE_PATTERN) || []
      ).map((m) => m.trim());

      const joinedParts = [];
      for (let i = 0; i < blocks.length; i += 1) {
        if (gaps[i] && gaps[i].length > 0 && (i === 0 || blocks[i])) {
          joinedParts.push(gaps[i].join("\n"));
        }
        if (blocks[i]) {
          const blockCode = blocks[i];
          if (
            blockCode.includes("<") ||
            blockCode.includes("export default") ||
            blockCode.includes("function ") ||
            blockCode.includes("import ") ||
            blockCode.includes("const ")
          ) {
            joinedParts.push(blockCode);
          }
        }
      }
      if (tailMarkers.length > 0 && joinedParts.length > 0) {
        joinedParts.push(tailMarkers.join("\n"));
      }
      const joined =
        joinedParts.filter(Boolean).join("\n\n") || validCodes.join("\n\n");

      const lastFenceIdx = text.lastIndexOf("```");
      const trailing =
        lastFenceIdx > -1 ? text.slice(lastFenceIdx + 3).trim() : "";
      const ORPHANED_CLOSE = /^\s*(?:<\/(?:script|style|body|html)>\s*)+$/i;
      if (trailing && ORPHANED_CLOSE.test(trailing)) {
        return finish(joined + "\n" + trailing);
      }
      return finish(joined);
    }
  }

  const matchAny = text.match(/```\s*([\s\S]*?)```/);
  if (matchAny && matchAny[1].trim()) {
    return finish(matchAny[1]);
  }

  const truncatedBlock = text.match(
    /```(?:html|xml|jsx|tsx|js|javascript|react)?\s*([\s\S]*)$/i,
  );
  if (truncatedBlock && truncatedBlock[1].trim()) {
    let code = truncatedBlock[1].trim();
    if (
      MULTI_PAGE_MARKER_ANY_PATTERN.test(code) ||
      MULTI_PAGE_MARKER_ANY_PATTERN.test(text)
    ) {
      const artifactStart = findArtifactStartIndex(text);
      if (artifactStart !== -1) {
        const fromArtifactStart = text.slice(artifactStart).trim();
        if (
          fromArtifactStart.includes("<html") ||
          fromArtifactStart.includes("<!DOCTYPE") ||
          fromArtifactStart.includes("</html>")
        ) {
          code = fromArtifactStart;
        }
      }
    }
    if (
      code.includes("<") ||
      code.includes("export default") ||
      code.includes("function ") ||
      code.includes("import ") ||
      code.includes("const ")
    ) {
      return finish(code);
    }
  }

  // 3. Unfenced multi-page site or HTML document
  const multiPageIdx = text.search(
    /<!--\s*(?:PAGE|CORESITE-PAGES):\s*[^\s>]+\s*-->/i,
  );
  if (multiPageIdx !== -1) {
    const candidate = text.slice(multiPageIdx).trim();
    if (
      candidate.includes("<html") ||
      candidate.includes("<!DOCTYPE") ||
      candidate.includes("</html>") ||
      candidate.includes("<body") ||
      candidate.includes("<head")
    ) {
      return finish(candidate);
    }
  }

  const htmlDocIdx = text.search(/(?:<!DOCTYPE\s+html|<html[\s>])/i);
  if (htmlDocIdx !== -1) {
    const candidate = text.slice(htmlDocIdx).trim();
    if (
      candidate.includes("</html>") ||
      candidate.includes("<body") ||
      candidate.includes("<head") ||
      candidate.includes("<style") ||
      candidate.includes("<script")
    ) {
      return finish(candidate);
    }
  }

  // 4. Standalone canvas game with context/loop
  const canvasIdx = text.search(/<canvas[\s>]/i);
  if (
    canvasIdx !== -1 &&
    (/\.getContext\s*\(/i.test(text) || /requestAnimationFrame/i.test(text))
  ) {
    const candidate = text.slice(canvasIdx).trim();
    return finish(candidate);
  }

  return null;
}

const AT_COMMANDS = new Set(["website", "game", "research", "image"]);

export function parseSlashCommand(prompt) {
  const text = String(prompt || "").trim();
  const match = text.match(/^@([a-z]+)\b/i);
  if (!match) return { command: null, rest: text };
  const command = match[1].toLowerCase();
  if (!AT_COMMANDS.has(command)) return { command: null, rest: text };
  return { command, rest: text.slice(match[0].length).trim() };
}

export const parseCommand = parseSlashCommand;

export function isSlashCommand(prompt) {
  return parseSlashCommand(prompt).command !== null;
}

export const isCommand = isSlashCommand;
