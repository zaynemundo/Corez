import { process as processPromptIntelligence } from "../promptIntelligence/index.js";
import { buildAwwwardsDesignPrompt } from "../../../packages/agent-core/context/designTokens.js";
import { fetchAwwwardsInspiration } from "../inspirationService.js";
import {
  retrieveSemanticCodePatterns,
  formatRetrievedPatternsForPrompt,
} from "../semanticCodeRetrieval.js";
import { WRITING_JOB_GUARD } from "./imagePipeline.js";
import { analyzePublicUserIntent } from "../aiService.js";

export const GAME_DEV_PATTERNS =
  /\b(game|gamedev|game development|play|chess|snake|pong|shooter|arcade|platformer|canvas game|2d game|3d game|simulator|physics sandbox|bot enemy|rpg|enemy|space defender|retro game|interactive game)\b|\b(build|make|create|develop|design)\b.*\b(game|simulator|simulation|sandbox)\b/i;

export function isGameDevIntent(prompt) {
  if (!prompt) return false;
  return GAME_DEV_PATTERNS.test(prompt);
}

const CODING_INTENT_PATTERNS = {
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b[\w\s,'"-]{0,48}?\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html|bot|enemy)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|bot|enemy)\b[\w\s,'"-]{0,48}?\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas|bot|enemy)\b/i,
  code: /\b(code|debug|bug|fix|error|javascript|typescript|python|react|css|html|component|function|api|compile|stack trace)\b/i,
};

// Social-media carousel copy ("create a post for this carousel",
// "LinkedIn/Instagram carousel post + caption") is WRITING, not a UI build.
// Instruction prefix only (first ~300 chars) so pasted body copy containing
// "research"/"design" cannot hijack intent. Explicit UI terms
// ("carousel component/UI/code/website") opt back into a build.
export function isSocialCarouselCopyRequest(prompt) {
  if (!prompt || typeof prompt !== "string") return false;
  const instruction = String(prompt).slice(0, 400).toLowerCase();
  const hasSocial =
    /\b(create|write|draft|compose|make|generate|need|want)\b.{0,60}\b(post|caption|carousel post|linkedin post|instagram post|social post)\b/i.test(
      instruction,
    ) ||
    /\bpost\s+for\s+(this|that|my|our|a|the)\s+carousel\b/i.test(instruction) ||
    (/\bcarousel\b/i.test(instruction) &&
      /\b(post|caption|hashtags?|slide\s+\d|slide\s+breakdown)\b/i.test(
        instruction,
      ));
  if (!hasSocial) return false;
  const hasExplicitUI =
    /\bcarousel\b.{0,30}\b(component|widget|\bui\b|ux|slider|code|react|jsx|html|website|web\s?app|landing\s?page)\b/i.test(
      instruction,
    ) ||
    /\b(build|code|develop|program)\b.{0,30}\b(carousel|slider)\b.{0,30}\b(component|widget|\bui\b|code|website|app)\b/i.test(
      instruction,
    );
  return !hasExplicitUI;
}

// Website requests must be explicit — same rules as `@image`. `@website`
// always qualifies. Natural-language detection is intentionally strict: the
// build verb must govern the website noun within a tight window (~48 chars,
// direct object), and writing/job contexts, code revisions, code blocks, and
// social-carousel copy never qualify.
const WEBSITE_VERB_SRC = `(?:build|make|create|generate|design|develop|launch|ship|prototype|code)`;
const WEBSITE_NOUN_SRC = `(?:websites?|web\\s?sites?|landing(?:\\s|-)?pages?|webpages?|web\\s?apps?|web\\s?applications?|homepages?|portfolio(?:\\s+sites?)?|dashboards?|admin(?:\\s|-)?panels?|portals?|saas)`;
const WEBSITE_BUILD_PATTERN = new RegExp(
  `\\b${WEBSITE_VERB_SRC}\\b[\\w\\s,'"-]{0,48}?\\b${WEBSITE_NOUN_SRC}\\b`,
  "i",
);
const WEBSITE_NOUN_VERB_PATTERN = new RegExp(
  `\\b${WEBSITE_NOUN_SRC}\\b[\\w\\s,'"-]{0,48}?\\b(?:build|make|create|generate|design|develop|launch|ship|prototype)\\b`,
  "i",
);

export function isRevisionContextPrompt(prompt) {
  return /\[(?:SURGICAL REVISION CONTEXT|Context: The user is requesting a revision)/i.test(
    String(prompt || ""),
  );
}

export function isExplicitWebsiteRequest(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return false;

  const lower = clean.toLowerCase();
  if (lower.startsWith("@website")) return true;

  if (
    /^\s*(?:revise(?:\s+code)?|update(?:\s+code)?|fix(?:\s+code)?|refactor(?:\s+code)?)\b/i.test(
      clean,
    )
  )
    return false;
  if (isRevisionContextPrompt(clean)) return false;
  if (
    clean.includes("```") ||
    /<!DOCTYPE\s+html|<html|<style|<script/i.test(clean)
  )
    return false;

  if (isSocialCarouselCopyRequest(clean)) return false;

  const hasWritingContext = WRITING_JOB_GUARD.test(clean);
  const hasBuildGovernance = WEBSITE_BUILD_PATTERN.test(clean);
  if (hasWritingContext && !hasBuildGovernance) return false;

  const firstLine = clean.split("\n")[0].trim();
  if (WEBSITE_BUILD_PATTERN.test(firstLine)) return true;
  if (WEBSITE_NOUN_VERB_PATTERN.test(firstLine) && !hasWritingContext)
    return true;
  if (clean.length < 300) {
    if (WEBSITE_BUILD_PATTERN.test(clean)) return true;
    if (WEBSITE_NOUN_VERB_PATTERN.test(clean) && !hasWritingContext)
      return true;
  }
  return false;
}

export async function improveCodingPrompt(prompt, intent = null) {
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!cleanPrompt) return cleanPrompt;

  // Social-carousel copy must never receive a coding spec (React/HTML) even if
  // an upstream classifier mislabels it as an app build.
  if (isSocialCarouselCopyRequest(cleanPrompt)) {
    return cleanPrompt;
  }

  const currentIntent = intent || analyzePublicUserIntent(cleanPrompt);
  const intentType = currentIntent?.type || "general";

  // A website mention without an explicit website request (same rules as
  // @image) must not be enriched as an app/website build.
  const websiteMentioned =
    /\b(website|web\s?site|landing page|webpage|web app|homepage|portfolio site|dashboard|admin panel|portal|saas|site)\b/i.test(
      cleanPrompt,
    );
  const websiteBlocked =
    websiteMentioned && !isExplicitWebsiteRequest(cleanPrompt);

  const isCoding =
    intentType === "code-help" ||
    (intentType === "app" && !websiteBlocked) ||
    CODING_INTENT_PATTERNS.code.test(cleanPrompt) ||
    (CODING_INTENT_PATTERNS.app.test(cleanPrompt) && !websiteBlocked);
  if (!isCoding) {
    return cleanPrompt;
  }

  const isAppIntent =
    (intentType === "app" && !websiteBlocked) ||
    (CODING_INTENT_PATTERNS.app.test(cleanPrompt) && !websiteBlocked);

  // Game creation: respond with a SMALL brief, not a feature dump.
  const isGameRequest =
    currentIntent?.primaryIntent === "game_creation" ||
    /\b(build|create|make|generate|design|want|need|give|show|play)\b.{0,60}\b(game|arcade|platformer|pong|snake|tetris|flappy|simulator|puzzle|shooter|rpg|runner|clicker)\b/i.test(
      cleanPrompt,
    );

  // Build the Awwwards design spec + live inspiration once for app requests.
  const useWebDesignReferences = isAppIntent && !isGameRequest;
  const designSpec = useWebDesignReferences
    ? buildAwwwardsDesignPrompt(cleanPrompt)
    : "";

  const OPTIONAL_CONTEXT_BUDGET_MS = 2500;
  const withOptionalBudget = (task, ms = OPTIONAL_CONTEXT_BUDGET_MS) => {
    let timer;
    const budget = new Promise((resolve) => {
      timer = setTimeout(() => resolve(""), ms);
    });
    return Promise.race([task.catch(() => ""), budget]).finally(() =>
      clearTimeout(timer),
    );
  };

  const liveInspirationTask = useWebDesignReferences
    ? (async () => {
        try {
          const { sites } = await fetchAwwwardsInspiration(cleanPrompt, null);
          if (sites.length === 0) return "";
          return `\n\n--- Live Awwwards Design Inspiration (real references) ---\n${sites
            .map((site) => {
              let text = `- ${site.title} — ${site.url}`;
              if (site.liveUrl) text += ` (Live site: ${site.liveUrl})`;
              if (site.description)
                text += `\n  Design approach: ${site.description}`;
              if (site.tags && site.tags.length > 0)
                text += `\n  Visual elements: ${site.tags.join(", ")}`;
              return text;
            })
            .join(
              "\n\n",
            )}\n\nUse these award-winning sites as visual direction for layout, typography, colour, and interaction quality.`;
        } catch {
          return "";
        }
      })()
    : null;

  // Retrieve relevant code patterns via semantic embedding search
  const semanticPatternsTask = (async () => {
    try {
      const patterns = await retrieveSemanticCodePatterns(cleanPrompt, {
        topK: 1,
        minSimilarity: 0.15,
      });
      return formatRetrievedPatternsForPrompt(patterns);
    } catch {
      return "";
    }
  })();

  const [liveInspiration, semanticPatternsPrompt] = await Promise.all([
    liveInspirationTask
      ? withOptionalBudget(liveInspirationTask)
      : Promise.resolve(""),
    withOptionalBudget(semanticPatternsTask),
  ]);

  // Simple revision handling: just return the prompt with code as-is, no surgical spec
  if (isRevisionContextPrompt(cleanPrompt)) {
    return `${cleanPrompt}${semanticPatternsPrompt}`;
  }

  // Use the Prompt Intelligence Engine for structured enrichment
  try {
    const pipelineResult = await processPromptIntelligence({
      prompt: cleanPrompt,
      dryRun: true,
    });

    if (
      pipelineResult &&
      pipelineResult.executionPrompt &&
      pipelineResult.executionPrompt !== cleanPrompt
    ) {
      return isAppIntent
        ? `${pipelineResult.executionPrompt}\n\n${designSpec}${liveInspiration}${semanticPatternsPrompt}`
        : pipelineResult.executionPrompt;
    }
  } catch {
    // Fall back to legacy enhancement on pipeline failure
  }

  if (isAppIntent) {
    if (isGameRequest) {
      return `${cleanPrompt}

[SINGLE-FILE GAME SPECIFICATION]:
- MANDATORY CHAT BRIEF: your response MUST begin with a 1-2 sentence chat brief BEFORE the code block — game title in bold, what the player does to win/lose, and the controls. Example: "Here's **Neon Pong** — bounce the ball past your rival to score. Move with the Arrow keys, Space to launch." NEVER output a bare code block with no brief. NEVER write a long feature list, architecture summary, or "I built..." paragraph.
- GAME ART DIRECTION: Follow any visual style the user explicitly requests. Otherwise infer a distinctive style from the game's genre, setting, mechanics, and audience; do NOT default to retro, pixel art, neon, or any other fixed aesthetic. Include a designed start screen and game-over screen, HUD, color palette, and typography that fit the game world. NEVER apply generic web "dark glassmorphism", glass panels, or luxury web-app styling to games.
- Build a complete, runnable, self-contained single-file HTML canvas game inside ONE SINGLE \`\`\`html ... \`\`\` code block with inline <style> and <script> tags.
- FULLSCREEN GAME REQUIREMENT: The game MUST fill the entire preview viewport — html/body with width:100%, height:100%, margin:0, overflow:hidden; a full-viewport canvas (width:100%, height:100%, display:block) with NO max-width, NO bordered box, NO rounded container around the game. Keep a fixed internal game resolution (e.g. 960x540) and scale it to the viewport with ctx.setTransform + a resize listener so the game always fills the screen.
- MOBILE: size the canvas from visualViewport (not just innerHeight) and listen for orientationchange; include on-screen touch controls (left/right/jump/action buttons) shown only on touch or coarse-pointer devices, bound with touchstart/touchend/touchcancel.
- COMPLETENESS CHECK before you finish: implement EVERY feature and rule you promise in the brief — score, lives, levels, enemies, collisions, win/lose states, menus — with no stubs, no TODOs, and no placeholder functions; the game must be fully playable end-to-end.
- GAME LOOP: fixed-timestep simulation — accumulate real dt (clamped to max 0.1s) and run update() in fixed STEP=1/60 increments inside requestAnimationFrame; never tie movement or physics directly to raw frame dt.
- CONTROLS: poll a held-key map every frame using e.code (layout-independent: KeyW/ArrowLeft/Space); preventDefault() scrolling keys (arrows/space); for mouse-look games use Pointer Lock; poll navigator.getGamepads() with a deadzone where controllers fit.
- AUDIO: procedural Web Audio SFX (jump, collect, hit, win, lose) plus a simple looping music pattern — zero external audio files; create AND resume() the AudioContext ONLY inside a user gesture (Start button click/keypress); add a mute toggle on M.
- ARCHITECTURE: explicit game-state machine (START/PLAYING/PAUSED/GAMEOVER/VICTORY, pausing on visibilitychange) and entity AI states (idle/patrol/chase/attack/flee); pool bullets/particles/enemies — reuse objects, never allocate with \`new\` inside the per-frame loop.
- GAME FEEL: screen shake on hits, hit-flash, particle bursts, floating score popups, and difficulty that ramps with score/time.
- ENEMY AI: give enemies a behavior ladder — patrol waypoints, chase on sight with steering (seek/flee/wander), grid pathfinding in mazes — scaled by a difficulty factor.
- PORTAL-READY: viewport meta and resize handling (already required above), zero external requests except approved CDNs, fully playable while muted.
- Output ONLY the brief followed by the code block — NO feature summary, NO step-by-step guide, NO closing paragraph after the code.`;
    }

    const isExplicitNonJsx =
      /\b(html\b|css\b|vanilla|plain html|pure html|html\/css|raw html|html\s*\+\s*css|vanilla js)\b/i.test(
        cleanPrompt,
      );
    const isOneShot =
      /\b(oneshot|one-shot|one shot|single[- ]page|one[- ]page)\b/i.test(
        cleanPrompt,
      );

    if (isExplicitNonJsx) {
      return `${cleanPrompt}

${designSpec}${liveInspiration}${semanticPatternsPrompt}

[SINGLE-FILE HTML/CSS/JS SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, layout, and styling choices!
- NEVER mention "Awwwards", "Awwwards-inspired", or internal prompt buzzwords in your output or preamble text. Describe your creation naturally without meta-commentary.
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output complete, clean HTML/CSS/JS code inside ONE SINGLE \`\`\`html ... \`\`\` code block including inline \`<style>\` and \`<script>\` tags.
- ${isOneShot ? "ONE-SHOT MODE: output ONE single page only — no sub-pages, no markers." : "MULTI-PAGE BY DEFAULT: output a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, put every page as its own complete standalone HTML document inside the SAME single code block. Write ONE marker line immediately BEFORE each page, INCLUDING the home page:"}
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete home page with inline <style>/<script> ...
  <!-- PAGE: about.html -->
  <!DOCTYPE html>... complete about page ...
  The home page MUST have its own <!-- PAGE: index.html --> line above it, and nothing (no HTML, no prose) may appear before that first marker — never write a page before its marker.
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: the FIRST line of the artifact is <!-- PAGE: index.html -->, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output ONE single page only (no sub-pages, no markers).
- Build a complete, responsive, standalone experience ready for the preview canvas.
- IMPLEMENTATION CHECK before you finish: implement EVERY feature you describe in the overview and every control the user asked for — no stubs, no TODOs, no placeholder functions; every button, form, and interactive element must actually work.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
    }

    return `${cleanPrompt}

${designSpec}${liveInspiration}${semanticPatternsPrompt}

[SINGLE-FILE REACT SPECIFICATION]:
- ALWAYS begin your response with a clear, detailed overview explaining the features, architecture, styling decisions, and layout choices!
- NEVER mention "Awwwards", "Awwwards-inspired", or internal prompt buzzwords in your output or preamble text. Describe your creation naturally without meta-commentary.
- Ensure proper visual layering and z-index stacking hierarchy (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals/Overlays z-index:40-50+) so elements don't obscure interactive controls!
- Output clean, modern React/JSX code inside ONE SINGLE \`\`\`jsx ... \`\`\` code block starting with \`export default function App()\`.
- DO NOT wrap React code inside HTML boilerplate (\`<!DOCTYPE html>\`, \`<head>\`, \`<script type="text/babel">\`, or \`ReactDOM.createRoot()\`) because the preview canvas automatically compiles and renders React/JSX code!
- Do NOT split your output into multiple separate code blocks, file headers (// App.tsx, // components/Navbar.tsx), or relative file imports (import Navbar from './components/Navbar').
- Define all child components (Navbar, Hero, Footer, etc.) inline within the SAME file BEFORE the main App component!
- MULTI-PAGE BY DEFAULT: build a multi-page website unless the user explicitly asked for ONE-SHOT (single page only). For multi-page output, switch to plain HTML and output every page as its own complete standalone HTML document inside the SAME single \`\`\`html ... \`\`\` code block. Write ONE marker line immediately BEFORE each page, INCLUDING the home page:
  <!-- PAGE: index.html -->
  <!DOCTYPE html>... complete home page ...
  <!-- PAGE: about.html -->
  <!DOCTYPE html>... complete about page ...
  The home page MUST have its own <!-- PAGE: index.html --> line above it, and nothing (no HTML, no prose) may appear before that first marker — never write a page before its marker.
  Link pages with PLAIN RELATIVE anchors ONLY: <a href="about.html">About</a>. Never use a leading slash or absolute URL for internal links (never "/about.html", "https://...", or "corez.pro/...") — the preview and the published site serve every page under its own folder (corez.pro/<slug>/about.html), so only bare relative filenames resolve to the right URL. Keep filenames lowercase like index.html, about.html, contact.html (max 12 pages). COMPLETENESS CHECK before you finish: the FIRST line of the artifact is <!-- PAGE: index.html -->, make every <a href="..."> point to a page you actually output (a link to a page you never created is a broken site), and keep every page a complete standalone HTML document.
- ONE-SHOT MODE: ONLY when the user explicitly asked for "oneshot" (or "one shot", "single page", "one page"), output a single React component exactly as described above (no sub-pages, no markers).
- IMPLEMENTATION CHECK before you finish: implement EVERY feature you describe in the overview and every control the user asked for — no stubs, no TODOs, no placeholder functions; every button and interactive element must actually work.
- ALWAYS end your response with a step-by-step user guide and feature summary after the code block! Never output ONLY a bare code block.`;
  }

  return `${cleanPrompt}

[CODE DIAGNOSIS & FIX SPECIFICATION]:
- Systematically inspect the root cause before writing code.
- Produce clean, modern, production-ready code preserving existing API signatures and component props.
- If the user asks to fix "incomplete site" or "links to missing page" validation errors in HTML:
  1) If repairing a single-page site: replace external .html links (<a href="about.html">, <a href="projects.html">, etc.) with in-page section anchors (<a href="#about">, <a href="#projects">, <a href="#contact">).
  2) If repairing a multi-page site: output all referenced pages inside the same code block using <!-- PAGE: index.html -->, <!-- PAGE: about.html -->, etc. markers.
- After writing the fix, re-read your answer for completeness: include the COMPLETE corrected code — never ellipses ("..."), "rest unchanged", or "same as before" placeholders.
- Include a concise explanation of the changes and test verification steps.`;
}
