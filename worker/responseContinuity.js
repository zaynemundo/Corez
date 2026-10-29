export function extractCodeBlocks(content) {
  const text = String(content || "");
  const blocks = [];
  const fencePattern = /```([a-zA-Z0-9+#-]*)\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(text)) !== null) {
    blocks.push({
      lang: match[1].trim().toLowerCase() || "plain",
      code: match[2],
    });
  }
  return blocks;
}

export const GAME_SIGNALS = [
  {
    id: "game-loop",
    pattern:
      /requestAnimationFrame|setInterval\s*\(|setTimeout\s*\(\s*(?:gameLoop|loop|update)/i,
  },
  {
    id: "controls",
    pattern:
      /\b(keydown|keyup|keyCode|addEventListener\s*\(\s*['"]key|onKeyDown|touchstart|touchend|pointerdown)/i,
  },
  { id: "scoring", pattern: /\b(score|points)\b/i },
  {
    id: "collision",
    pattern:
      /\b(collide|collision|intersect|isTouching|overlap|hitTest|wallCollision|selfCollision)\b/i,
  },
  { id: "canvas", pattern: /\b(getContext\s*\(\s*['"]2d|canvas)\b/i },
];

export function checkGameRequirements(code) {
  const combined = Array.isArray(code) ? code.join("\n") : String(code || "");
  return GAME_SIGNALS.filter((signal) => signal.pattern.test(combined)).map(
    (signal) => signal.id,
  );
}

// Every game deliverable must reach chat with a 1-2 sentence brief BEFORE
// the code block (title + goal + controls). Models sometimes return a bare
// code block despite the system prompt, leaving chat with no description.
// This deterministic fallback injects a short brief derived from the game's
// own <title>/controls so chat always has one. Non-game answers pass through
// byte-identical.
export function ensureGameChatBrief(content, userPrompt = "") {
  const text = String(content || "");
  if (!text.trim()) return text;

  const blocks = extractCodeBlocks(text);
  let code = blocks.map((b) => b.code).join("\n");
  let fenceIdx = text.search(/```/);

  if (!code) {
    // Unfenced HTML deliverable (raw <!DOCTYPE html> pasted without fences).
    const htmlIdx = text.search(/(?:<!DOCTYPE\s+html|<html[\s>])/i);
    if (htmlIdx === -1) return text;
    code = text.slice(htmlIdx);
    fenceIdx = htmlIdx;
  }

  const signals = checkGameRequirements(code);
  const hasControls = signals.includes("controls");
  const hasLoop = signals.includes("game-loop") || signals.includes("canvas");
  if (!hasControls || !hasLoop) return text;

  // Most false positives are static canvas demos: require scoring,
  // collision, or an explicit game ask before injecting.
  const gameLike =
    signals.includes("scoring") ||
    signals.includes("collision") ||
    /\b(game|playable|player|enemy|level|score|win\b|lose\b)/i.test(
      `${userPrompt} ${code.slice(0, 2000)}`,
    );
  if (!gameLike) return text;

  const rawPreamble = fenceIdx > 0 ? text.slice(0, fenceIdx).trim() : "";
  const preamble = rawPreamble
    .replace(/(?:\r?\n|^)\s*(?:Fullscreen|Preview)\s*$/i, "")
    .trim();
  // An existing 20+ char prose preamble counts as the brief — keep it.
  if (preamble.length >= 20 && /[a-zA-Z]{3,}/.test(preamble)) return text;

  const titleMatch =
    code.match(/<title>([^<]{3,80})<\/title>/i) ||
    code.match(/<h1[^>]*>([^<]{3,60})</i);
  let title = (titleMatch && titleMatch[1].trim()) || "Your new game";
  title = title.replace(/\s+/g, " ").slice(0, 60);

  let goal = "play to win";
  if (/collect|coin|orb/i.test(code)) goal = "collect to score and win";
  else if (/score/i.test(code)) goal = "score points to win";
  else if (/surviv|dodge|avoid|enemy/i.test(code))
    goal = "dodge enemies and survive";

  const controls = [];
  if (/KeyW|WASD/i.test(code)) controls.push("Move with WASD/Arrow keys");
  else if (/ArrowLeft|keydown/i.test(code))
    controls.push("Move with the Arrow keys");
  if (/Space/i.test(code)) controls.push("Space to jump/launch");
  if (/touchstart|touchend|pointerdown/i.test(code))
    controls.push("plus on-screen touch controls");
  if (controls.length === 0) controls.push("Use the keyboard to play");

  const brief = `Here's **${title}** — ${goal}. ${controls.join(", ")}.`;
  return `${brief}\n\n${text.trimStart()}`;
}

// Every website/app deliverable must reach chat with a short description
// BEFORE the code. The system prompt requires it, but models sometimes
// return a bare code block or raw HTML — harness builds especially, since
// they stream the artifact with no preamble — leaving chat with code and
// no description. This deterministic fallback prepends a 1-2 sentence
// brief derived from the artifact's own <title>/headings so chat always
// has one. Game-like content is owned by ensureGameChatBrief; fragments,
// components and non-deliverables pass through byte-identical.
export function ensureSiteChatBrief(content, userPrompt = "") {
  const text = String(content || "");
  if (!text.trim()) return text;

  const fenceIdx = text.search(/```/);
  const htmlIdx = text.search(/(?:<!DOCTYPE\s+html|<html[\s>])/i);
  if (fenceIdx === -1 && htmlIdx === -1) return text;
  const start =
    fenceIdx !== -1 && (htmlIdx === -1 || fenceIdx < htmlIdx)
      ? fenceIdx
      : htmlIdx;
  const code = text.slice(start);

  // Must present as a site/app document, not a snippet or explanation.
  if (!/(?:<!DOCTYPE\s+html|<html[\s>])/i.test(code)) return text;

  // Games are owned by the game brief — never double-brief.
  const signals = checkGameRequirements(code);
  const gameLike =
    (signals.includes("controls") &&
      (signals.includes("game-loop") || signals.includes("canvas"))) ||
    signals.includes("scoring") ||
    signals.includes("collision") ||
    /\b(game|playable|player|enemy|level)\b/i.test(
      `${userPrompt} ${code.slice(0, 2000)}`,
    );
  if (gameLike) return text;

  const rawPreamble = start > 0 ? text.slice(0, start).trim() : "";
  const preamble = rawPreamble
    .replace(/(?:\r?\n|^)\s*(?:Fullscreen|Preview)\s*$/i, "")
    .trim();
  // An existing 20+ char prose preamble counts as the description — keep it.
  if (preamble.length >= 20 && /[a-zA-Z]{3,}/.test(preamble)) return text;

  const titleMatch =
    code.match(/<title>([^<]{3,80})<\/title>/i) ||
    code.match(/<h1[^>]*>([^<]{3,60})</i);
  let title = (titleMatch && titleMatch[1].trim()) || "Your new site";
  title = title.replace(/\s+/g, " ").slice(0, 60);

  const sections = [...code.matchAll(/<h2[^>]*>([^<]{2,60})</gi)]
    .map((m) => m[1].replace(/\s+/g, " ").trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .slice(0, 5);

  const brief =
    sections.length > 0
      ? `Here's **${title}** — featuring ${sections.join(" • ")}.`
      : `Here's **${title}** — built from your brief, ready to preview.`;
  return `${brief}\n\n${text.trimStart()}`;
}

export function analyzeProjectState(messages) {
  const history = Array.isArray(messages) ? messages : [];
  const assistantReplies = history
    .filter((m) => m?.role === "assistant" && typeof m?.content === "string")
    .map((m) => m.content);
  const latest = assistantReplies[assistantReplies.length - 1] || "";
  const blocks = extractCodeBlocks(latest);
  const code = blocks.map((b) => b.code).join("\n");
  const project = {
    projectType: null,
    framework: "unknown",
    language: "javascript",
    rendering: null,
    features: [],
    constraints: [],
    recentChanges: [],
    latestCode: code,
  };

  if (/<canvas[\s>]/i.test(code) || /\bgetContext\s*\(\s*['"]2d/.test(code))
    project.rendering = "canvas";
  const jsx =
    /\b(import\s+.*\bReact\b|ReactDOM|export default function \w+\s*\(|useState|useEffect)/.test(
      code,
    );
  if (jsx || blocks.some((b) => b.lang === "jsx")) {
    project.framework = "react";
    project.language = "javascript";
  } else if (/<html[\s>]/i.test(code) && !/\bimport\b/.test(code)) {
    project.framework = "html";
    project.language = "html-css-js";
  } else if (/\b(typescript|\.tsx?)/.test(code)) {
    project.framework = jsx ? "react" : "unknown";
    project.language = "typescript";
  }

  const gameIntent =
    /<canvas[\s>]/i.test(code) ||
    /\b(game|level|enemy|player|score)\b/i.test(code);
  if (gameIntent && project.rendering === "canvas")
    project.projectType = "game";
  else if (/<html[\s>]/i.test(code) || jsx) project.projectType = "website";
  else project.projectType = "app";

  for (const signal of GAME_SIGNALS)
    if (signal.pattern.test(code)) project.features.push(signal.id);
  if (/\b(restart|reset|gameOver\s*=\s*false)\b/i.test(code))
    project.features.push("restart");
  if (/\b(game[- ]?over|gameOver)\b/i.test(code))
    project.features.push("game-over");
  return { project, blocks, latestReply: latest };
}

export function isModificationRequest(prompt, project) {
  if (!project || project.framework === "unknown") return false;
  const text = String(prompt || "");
  return /\b(now|also|instead|change|make|add|remove|update|fix|modify|edit|undo|revert|don'?t|keep|preserve|convert|replace|switch)\b/i.test(
    text,
  );
}

function stableLines(code) {
  return String(code || "")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(
      (line) =>
        line.length >= 12 &&
        !line.startsWith("//") &&
        !line.startsWith("/*") &&
        !line.startsWith("*"),
    );
}

function lineRetentionRatio(previousCode, currentCode) {
  const previous = stableLines(previousCode);
  if (previous.length === 0) return 1;
  const current = new Set(stableLines(currentCode));
  const retained = previous.filter((line) => current.has(line)).length;
  return retained / previous.length;
}

export function scoreContinuity({ project, response, userPrompt }) {
  const text = String(response || "");
  const blocks = extractCodeBlocks(text);
  const code = blocks.map((b) => b.code).join("\n");
  const checks = {
    "used-previous-implementation": false,
    "preserved-framework": false,
    "preserved-unrelated-features": false,
    "implemented-requested-change": false,
    "avoided-unnecessary-rewrite": false,
  };

  if (project.framework === "react") {
    checks["preserved-framework"] =
      /\b(ReactDOM|useState|useEffect|export default function \w+\s*\()/.test(
        code,
      ) || blocks.some((b) => b.lang === "jsx");
  } else if (project.framework === "html") {
    checks["preserved-framework"] = /<html[\s>]/i.test(code);
  } else {
    checks["preserved-framework"] = blocks.length > 0;
  }

  const features = Array.isArray(project.features) ? project.features : [];
  if (features.length > 0) {
    const preserved = features.filter((feature) => {
      const pattern = GAME_SIGNALS.find((s) => s.id === feature)?.pattern;
      if (pattern) return pattern.test(code);
      if (feature === "restart") return /\b(restart|reset)\b/i.test(code);
      if (feature === "game-over")
        return /\b(game[- ]?over|gameOver)\b/i.test(code);
      return false;
    });
    checks["preserved-unrelated-features"] =
      preserved.length >= Math.max(1, Math.ceil(features.length * 0.75));
  } else {
    checks["preserved-unrelated-features"] = blocks.length > 0;
  }

  const prompt = String(userPrompt || "");
  if (/\b(speed|faster|slower|gradual)\b/i.test(prompt))
    checks["implemented-requested-change"] =
      /\b(speed|interval|delay|velocity|rate)\b/i.test(code);
  else if (/\b(blue)\b/i.test(prompt))
    checks["implemented-requested-change"] =
      /\bblue\b|#(?:00f|0000ff|0{0,2}[0-4][0-9a-f]{2,4})\b/i.test(code);
  else if (/\b(touch|mobile)\b/i.test(prompt))
    checks["implemented-requested-change"] =
      /\b(touch|pointer|ontouch|touchstart|touchend)\b/i.test(code);
  else if (/\b(undo|revert|remove)\b/i.test(prompt))
    checks["implemented-requested-change"] = blocks.length > 0;
  else checks["implemented-requested-change"] = blocks.length > 0;

  const previousCode = String(project.latestCode || "");
  const retentionRatio =
    previousCode && code ? lineRetentionRatio(previousCode, code) : null;
  if (retentionRatio === null) {
    checks["avoided-unnecessary-rewrite"] = checks["preserved-framework"];
  } else {
    // A small edit should retain most lines. A larger feature addition can
    // legitimately move more code, so 45% is the floor for "same project".
    checks["avoided-unnecessary-rewrite"] = retentionRatio >= 0.45;
  }
  checks["used-previous-implementation"] =
    checks["preserved-framework"] && checks["avoided-unnecessary-rewrite"];

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 50) / 10;
  return {
    score,
    checks,
    codeBlockCount: blocks.length,
    retainedLineRatio: retentionRatio,
  };
}

export function mergeProjectState(target, answer, userPrompt) {
  if (!target || typeof target !== "object") return;
  const next = analyzeProjectState([
    { role: "assistant", content: answer },
  ]).project;
  if (next.framework && next.framework !== "unknown")
    target.framework = next.framework;
  if (next.projectType) target.projectType = next.projectType;
  if (next.language) target.language = next.language;
  if (next.rendering) target.rendering = next.rendering;
  if (Array.isArray(next.features) && next.features.length > 0)
    target.features = [...new Set(next.features)];
  const priorChanges = Array.isArray(target.recentChanges)
    ? target.recentChanges
    : [];
  const change = String(userPrompt || "").trim();
  if (change)
    target.recentChanges = [...priorChanges, change.slice(0, 180)].slice(-10);
  target.latestCode = next.latestCode || target.latestCode;
}
