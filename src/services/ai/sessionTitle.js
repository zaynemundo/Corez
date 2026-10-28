import { classifyIntent as classifyIntentNew } from "../promptIntelligence/index.js";
import { AI_PROXY_ENDPOINT, parseSlashCommand } from "../aiService.js";
import { IMAGE_REQUEST_TAIL } from "./imagePipeline.js";

const GAME_GENRE_PATTERN =
  /\b(platformer|puzzle|arcade|shooter|racing|rpg|role[- ]?playing|survival|horror|tower[- ]?defense|idle|clicker|simulator|sim|strategy|sports|fighting|battle[- ]?royale|snake|pong|tetris|flappy[- ]?bird|wordle|crossword|memory|maze|endless[- ]?runner|runner|fps)\b/i;

const PROPER_NAME_PATTERN =
  /\b(?:called|named|titled)\s+["'`]?([A-Z][A-Za-z0-9' -]{1,24})/i;

const SITE_SUBJECT_PATTERN =
  /\b(?:for|of|about)\s+(?:my|our|the|a|an)?\s*([a-z][a-z0-9' -]{1,24})/i;

const FEATURE_PATTERN =
  /\b(?:fix|repair|implement|add|build|create|refactor|improve|update)\s+(?:the|a|an)?\s*([a-z][a-z0-9 _-]{2,24})/i;

function capitalizeTitle(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Generate a short, suiting title from a conversation's first prompt.
 * The intent engine classifies what the user wants (game, website, image,
 * explanation, code task...), then a subject is extracted from
 * the prompt itself so the title names the actual deliverable instead of
 * echoing the raw sentence.
 */
export function generateSessionTitle(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return "New Conversation";
  try {
    const { command, rest } = parseSlashCommand(clean);
    if (command === "image") {
      const subject = rest
        .replace(/^(please\s+)?(can you|could you|would you|please)\s+/i, "")
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s*[.!?]+$/, "")
        .trim();
      return capitalizeTitle(`Generate a ${subject || "custom"} image`).slice(
        0,
        40,
      );
    }

    const fine = classifyIntentNew(clean);
    const type = fine?.primaryIntent || fine?.type || "general";
    const lower = clean.toLowerCase();

    let title = "";
    if (type === "game_creation") {
      const genreMatch = lower.match(GAME_GENRE_PATTERN);
      let genre = genreMatch ? genreMatch[1].toLowerCase() : "custom";
      if (genre === "rpg" || genre === "fps") genre = genre.toUpperCase();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : "";
      title = `Build a ${genre} game${name ? `: ${name}` : ""}`;
    } else if (type === "website_creation" || type === "design_task") {
      const subjectMatch = clean.match(SITE_SUBJECT_PATTERN);
      let subject = subjectMatch ? subjectMatch[1].trim() : "";
      subject = subject
        .split(/\s+(?:called|named|titled|with|that|and|using|for)\b/i)[0]
        .trim();
      const nameMatch = clean.match(PROPER_NAME_PATTERN);
      const name = nameMatch ? nameMatch[1].trim() : "";
      title = subject
        ? `Create a ${subject} website${name ? `: ${name}` : ""}`
        : `Create a website${name ? `: ${name}` : ""}`;
    } else if (type === "image_generation") {
      const subject = clean
        .replace(/^(please\s+)?(can you|could you|would you|please)\s+/i, "")
        .replace(
          /^(generate|create|make|draw|render|show me|give me|show|give|get|want|need|produce|i want|i need|i'?d like)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\s+(of|for|showing|featuring|with|that|about)\s+/i,
          "",
        )
        .replace(IMAGE_REQUEST_TAIL, "")
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s*[.!?]+$/, "")
        .trim();
      title = `Generate a ${subject || "custom"} image`;
    } else if (
      type === "bug_fix" ||
      type === "code_refactor" ||
      type === "feature_implementation" ||
      type === "simple_edit"
    ) {
      const featureMatch = clean.match(FEATURE_PATTERN);
      const feature = featureMatch ? featureMatch[1].trim() : "";
      title = feature
        ? `${type === "bug_fix" ? "Fix" : type === "code_refactor" ? "Refactor" : "Implement"} ${feature}`
        : capitalizeTitle(type.replace(/_/g, " "));
    } else if (type === "explanation") {
      title = clean
        .replace(
          /^(can you|could you|please|hey|hello|hi|corez|corez ai)[,\s]*/i,
          "",
        )
        .replace(/\s*[.!?]+$/, "")
        .trim();
    } else {
      title = clean.replace(/\s*[.!?]+$/, "").trim();
    }

    return capitalizeTitle(title).slice(0, 40) || "New Conversation";
  } catch {
    return clean.slice(0, 30) || "New Conversation";
  }
}

/**
 * Ask the hosted AI to name a conversation from its first user message.
 * The worker answers with a tiny, capped title-only generation; any failure
 * falls back to the deterministic heuristic so a title is always produced.
 */
export async function generateAISessionTitle(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return generateSessionTitle(clean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(AI_PROXY_ENDPOINT, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: clean.slice(0, 400), titleOnly: true }),
    });
    if (!response.ok)
      throw new Error(
        `Session title request failed with status ${response.status}.`,
      );
    const data = await response.json();
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    return title ? title.slice(0, 60) : generateSessionTitle(clean);
  } catch {
    return generateSessionTitle(clean);
  } finally {
    clearTimeout(timeout);
  }
}
