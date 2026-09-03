// Swarm pre-pass for the creation harness.
//
// Non-fast-path creation builds (complex websites/apps) run a small swarm of
// PARALLEL specialist briefs — architecture, art direction — before the
// streamed build. Each specialist answers with a short, focused contribution
// (no code), and all contributions are injected into the build context so
// the single streamed artifact is better informed on the FIRST attempt:
// fewer truncations and repair rounds means less wall time and less worker
// CPU re-streaming full artifacts.
//
// The swarm is an ENHANCEMENT, never a gate: any specialist failure falls
// back to the plain build context, and the whole pre-pass can be disabled
// with AI_SWARM_ENABLED=false. Nothing here caps what the AI may produce —
// the build stream itself is unchanged and uncapped.

import { runProviderChain } from "./providerChain.js";
import {
  detectDesignArchetype,
  buildDesignSystemPrompt,
  generateTokensCss,
} from "./designSystems.js";

const SPEC_SYSTEM_PROMPT =
  "You are COREZ AI, an AI creation platform that builds websites, apps, and games. Answer directly with the requested output only.";

// Each specialist gets a focused brief and a hard word budget so the calls
// stay short and fast — the parallelism, not the prompt size, is the point.
export const SWARM_SPECIALIST_BRIEFS = Object.freeze([
  {
    role: "architect",
    instruction:
      "Analyze the build specification below and produce a concise implementation brief: overall page structure, key sections, state and data flow, and the components that must exist. If multi-page navigation is requested, outline page routes (e.g. index.html, about.html). At most 200 words. Do not write code.",
  },
  {
    role: "art-director",
    instruction:
      "Produce a concise visual direction brief grounded in modern design principles and quality standards: active color palette with hex/HSL tokens, typography hierarchy (Google Fonts), spacing scale, and 2-3 signature micro-interactions. Avoid purple-on-dark cliches and flat textureless cards. At most 175 words. Do not write code.",
  },
]);

export const EXTENDED_SPECIALIST_BRIEFS = Object.freeze({
  accessibility: {
    role: "accessibility",
    instruction:
      "Produce a concise accessibility & usability brief: semantic HTML5 landmarks (<header>, <nav>, <main>, <footer>), keyboard focus rings, WCAG 2.2 AA contrast rules, and ARIA labels. At most 150 words. Do not write code.",
  },
  performance: {
    role: "performance",
    instruction:
      "Produce a concise performance brief: critical rendering path, asset containment, efficient CSS selectors, and script execution order. At most 150 words. Do not write code.",
  },
  "game-designer": {
    role: "game-designer",
    // Taken from agency-agents/game-development/game-designer.md:
    // loops, mechanic spec, tuning levers, onboarding in 30s.
    instruction:
      "Produce a concise game-design brief for a 2D/3D platformer: 3 player verbs, micro (3s) / meso (30s) / macro (5min) loops, win/lose conditions, coyote-time + jump-buffering, score/coin economy with sources/sinks, and onboarding (core verb in 30s, first success guaranteed). Smooth minimalist HD, never pixel/8-bit. At most 175 words. Do not write code.",
  },
  "level-designer": {
    role: "level-designer",
    // Taken from agency-agents/game-development/level-designer.md:
    // legible critical path, pacing arc, grey-box first, encounters.
    instruction:
      "Produce a concise level-design brief for a platformer level: legible critical path, pacing arc (tension/release), 3-5 jumps + 1 patrol enemy + coins, safe onboarding then escalation, exit visible, fallback positions, touch + keyboard readable. Smooth minimalist HD shapes, no pixel art. At most 150 words. Do not write code.",
  },
});

export function resolveSpecialistBriefs(promptText = "") {
  const text = String(promptText || "").toLowerCase();
  const briefs = [...SWARM_SPECIALIST_BRIEFS];

  if (
    /\b(accessibility|wcag|a11y|screen reader|aria|contrast|accessible)\b/i.test(
      text,
    )
  ) {
    briefs.push(EXTENDED_SPECIALIST_BRIEFS.accessibility);
  }
  if (
    /\b(performance|optimize|speed|fast|lighthouse|latency|fps)\b/i.test(text)
  ) {
    briefs.push(EXTENDED_SPECIALIST_BRIEFS.performance);
  }
  if (
    /\b(game|platformer|2d|3d|godot|unity|unreal|roblox|jump|runner|shooter|puzzle|rpg)\b/i.test(
      text,
    )
  ) {
    briefs.push(EXTENDED_SPECIALIST_BRIEFS["game-designer"]);
    briefs.push(EXTENDED_SPECIALIST_BRIEFS["level-designer"]);
  }

  return briefs;
}

const DEFAULT_SWARM_TIMEOUT_MS = 25_000;

export function envFlagEnabled(env, key, defaultValue = true) {
  const value = env?.[key];
  if (value === undefined || value === null) return defaultValue;
  const str = String(value).trim().toLowerCase();
  if (str === "") return defaultValue;
  return str !== "false" && str !== "0" && str !== "no";
}

export function swarmEnabledFor(env) {
  return envFlagEnabled(env, "AI_SWARM_ENABLED", true);
}

/**
 * Run all specialist briefs in parallel. Each call is a compact non-stream
 * provider request (no deltas -> minimal worker CPU). Returns:
 *   { contributions: [{ role, content, model, elapsedMs }], elapsedMs,
 *     cancelled, reason }
 * Failed specialists are dropped from contributions; if every specialist
 * fails, `reason` explains why and `contributions` is empty.
 */
export async function runSwarmSpecialists({
  prompt,
  spec,
  env = {},
  signal = null,
  sleep,
}) {
  const startedAt = Date.now();
  const timeoutMs =
    Number(env?.AI_SWARM_TIMEOUT_MS) > 0
      ? Number(env?.AI_SWARM_TIMEOUT_MS)
      : DEFAULT_SWARM_TIMEOUT_MS;
  // The same tight non-stream deadline guard the planning call uses: a hung
  // specialist surfaces quickly instead of burning the full 90s timeout.
  const chainEnv = { ...env, AI_NONSTREAM_TIMEOUT_MS: String(timeoutMs) };
  const brief = String(spec || "").trim();
  const originalRequest = String(prompt || "").trim();

  const archetype = detectDesignArchetype(`${originalRequest} ${brief}`);
  const tokensSample = generateTokensCss(archetype);
  const activeBriefs = resolveSpecialistBriefs(`${originalRequest} ${brief}`);

  const results = await Promise.allSettled(
    activeBriefs.map((specialist) => {
      const isArtDirector = specialist.role === "art-director";
      const specialistInstruction = isArtDirector
        ? `${specialist.instruction}\n\nRecommended Archetype Tokens (${archetype.name}):\n${tokensSample}`
        : specialist.instruction;

      const messages = [
        { role: "system", content: SPEC_SYSTEM_PROMPT },
        { role: "system", content: specialistInstruction },
        {
          role: "user",
          content: `Original request:\n${originalRequest}\n\nBuild specification:\n${brief}`,
        },
      ];
      return runProviderChain(messages, {
        env: chainEnv,
        signal,
        store: null,
        sleep,
        maxRequestRetryMs: timeoutMs,
      });
    }),
  );

  if (signal?.aborted) {
    return {
      contributions: [],
      elapsedMs: Date.now() - startedAt,
      cancelled: true,
    };
  }

  const contributions = [];
  const failures = [];
  for (let index = 0; index < results.length; index += 1) {
    const outcome = results[index];
    const role = activeBriefs[index].role;
    if (outcome.status === "fulfilled" && outcome.value?.content) {
      contributions.push({
        role,
        content: outcome.value.content,
        model: outcome.value.model || null,
      });
    } else {
      const result = outcome.status === "fulfilled" ? outcome.value : null;
      failures.push(
        `${role}: ${result?.error || (outcome.status === "rejected" ? String(outcome.reason) : "no usable response")}`,
      );
    }
  }

  return {
    contributions,
    archetype: archetype.id,
    elapsedMs: Date.now() - startedAt,
    cancelled: false,
    reason:
      contributions.length === 0
        ? failures.slice(0, 2).join(" | ").slice(0, 300) ||
          "no specialist contributions"
        : null,
  };
}

/**
 * Build the enriched build-context for the streamed artifact. Preserves the
 * original single-file contract and appends each specialist contribution in
 * stable role order.
 */
export function buildSwarmContext(spec, contributions, options = {}) {
  const parts = [`Build specification:\n${String(spec || "").trim()}`];
  if (Array.isArray(contributions) && contributions.length > 0) {
    for (const contribution of contributions) {
      if (contribution?.role && contribution?.content) {
        parts.push(`## ${contribution.role}\n${contribution.content}`);
      }
    }
    const designPrompt = buildDesignSystemPrompt(
      options.prompt || spec,
      options,
    );
    if (designPrompt) {
      parts.push(designPrompt);
    }
  }
  parts.push(
    "Deliver ONLY the complete, finished artifact as a single self-contained HTML document.",
  );
  return parts.join("\n\n");
}
