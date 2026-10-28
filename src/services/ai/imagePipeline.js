import { classifyIntent as classifyIntentNew } from "../promptIntelligence/index.js";
import {
  IMAGE_PROXY_ENDPOINT,
  compactConversationForRequest,
  generateHostedAIResponse,
  isRevisionContextPrompt,
} from "../aiService.js";

export const WORKERS_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
export const WORKERS_AI_SDXL_LIGHTNING_MODEL =
  "@cf/bytedance/stable-diffusion-xl-lightning";
export const WORKERS_AI_IMAGE_ENDPOINT = "/api/image/cf";

const IMAGE_VERB_SRC = `(?:generate|create|draw|paint|make|render|show|give\\s+me|give\\s+us|want|need|produce)`;
const IMAGE_NOUN_SRC = `(?:images?|pictures?|photos?|pics?|logos?|illustrations?|artworks?|wallpapers?|drawings?|paintings?|icons?|visuals?|shots?)`;
const GRAPHIC_NOUN_SRC = `graphic(?!\\s+(?:design|designer|designs|designing)\\b)`;
const IMAGE_PATTERNS = new RegExp(
  `\\b${IMAGE_VERB_SRC}\\b[\\w\\s,'"-]{0,48}?\\b(?:${IMAGE_NOUN_SRC}|${GRAPHIC_NOUN_SRC})\\b|\\b(?:${IMAGE_NOUN_SRC}|${GRAPHIC_NOUN_SRC})\\b[\\w\\s,'"-]{0,48}?\\b(?:generate|create|draw|paint|make|render|flux)\\b`,
  "i",
);

export const WRITING_JOB_GUARD =
  /\b(e-?mail|cover\s*letter|\bcv\b|resume|curriculum\s+vitae|job\s+application|applying\s+for)\b/i;

// "Restyle this room/photo" is an image edit, not a website build. Keep the
// noun list deliberately spatial/visual so "redesign this page" stays UI work.
const IMAGE_EDIT_PATTERNS =
  /\b(?:restyle|redecorate|renovate|remodel|redesign|reimagine)\b[\s\S]{0,36}?\b(?:room|space|interior|kitchen|bedroom|living room|photo|picture|image)\b/i;

const IMAGE_TITLE_SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "for",
  "with",
  "of",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "as",
  "via",
  "vs",
]);

const QUESTION_PATTERNS =
  /\b(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\b/i;

export const IMAGE_REQUEST_TAIL =
  /\s*(and|also|then)?\s*(can you|could you|would you|please)?\s*(show|give|send|make|draw|generate|get)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\s*(of|for|showing)?\s*[.!?]*$/i;

export function createFallbackSvgDataUrl(prompt) {
  const cleanPrompt = (prompt || "8-Bit Asset").slice(0, 40);
  const lower = cleanPrompt.toLowerCase();

  let spriteType = "badge";
  if (
    lower.includes("sword") ||
    lower.includes("blade") ||
    lower.includes("weapon")
  )
    spriteType = "sword";
  else if (
    lower.includes("shield") ||
    lower.includes("armor") ||
    lower.includes("defense")
  )
    spriteType = "shield";
  else if (
    lower.includes("potion") ||
    lower.includes("flask") ||
    lower.includes("magic") ||
    lower.includes("elixir")
  )
    spriteType = "potion";
  else if (
    lower.includes("chest") ||
    lower.includes("crate") ||
    lower.includes("treasure") ||
    lower.includes("loot")
  )
    spriteType = "chest";
  else if (
    lower.includes("knight") ||
    lower.includes("hero") ||
    lower.includes("character") ||
    lower.includes("player")
  )
    spriteType = "hero";
  else if (
    lower.includes("monster") ||
    lower.includes("enemy") ||
    lower.includes("skull") ||
    lower.includes("boss")
  )
    spriteType = "monster";
  else if (
    lower.includes("gem") ||
    lower.includes("star") ||
    lower.includes("coin") ||
    lower.includes("crystal")
  )
    spriteType = "gem";
  else if (
    lower.includes("flower") ||
    lower.includes("floral") ||
    lower.includes("blossom") ||
    lower.includes("rose") ||
    lower.includes("tulip") ||
    lower.includes("daisy") ||
    lower.includes("nature") ||
    lower.includes("plant")
  )
    spriteType = "potion";

  const colorMap = {
    ".": null,
    B: "#12121e",
    W: "#ffffff",
    G: "#f1fa8c",
    R: "#ff5555",
    C: "#8be9fd",
    P: "#bd93f9",
    S: "#f8f8f2",
    O: "#ffb86c",
    K: "#6272a4",
    E: "#50fa7b",
    D: "#44475a",
    M: "#ff79c6",
  };

  const spriteMatrices = {
    sword: [
      "................",
      "...............W",
      "..............WS",
      ".............WSK",
      "............WSK.",
      "...........WSK..",
      "..........WSK...",
      ".........WSK....",
      "........WSK.....",
      "..M...M.SK......",
      "..MMM.MKK.......",
      "...MMMMK........",
      "....MMMD........",
      "...D..D.........",
      "..D.............",
      "................",
    ],
    shield: [
      "................",
      ".BBBBBBBBBBBBBB.",
      ".BWWWWWWWWWWWWB.",
      ".BWGGGGGGGGGGWB.",
      ".BWGPPBBPPEGGWB.",
      ".BWGPPPPPEEGGWB.",
      ".BWGPEEEEEEGGWB.",
      ".BWGPEEEEEEGGWB.",
      "..BWGPEEEEGGWB..",
      "...BWGPEEEGGWB..",
      "....BWGPEEGGB...",
      ".....BWGPEGB....",
      "......BWGPEB....",
      ".......BWGB.....",
      "........BBB.....",
      "................",
    ],
    potion: [
      "................",
      "......DDDD......",
      "......DGGGD.....",
      "......DDDD......",
      ".......BB.......",
      "......BCCB......",
      ".....BCCCCCCB...",
      "....BCCCCCCB....",
      "...BCCCCWWCCB...",
      "...BCCCCWWCCB...",
      "...BCCCCWWCCB...",
      "...BCCCCWWCCB...",
      "...BCCCCWWCCB...",
      "....BCCCCCCB....",
      ".....BBBBBB.....",
      "................",
    ],
    chest: [
      "................",
      "..BBBBBBBBBBBB..",
      ".BDDDDDDDDDDDDB.",
      ".BDDGGGGGGGGDDB.",
      ".BDDDDDDDDDDDDB.",
      ".BBBBBBBBBBBBBB.",
      ".BDDDDDGGDDDDDB.",
      ".BDDDDDBBDDDDDB.",
      ".BDDDDDBGDDDDDB.",
      ".BDDDDDBGDDDDDB.",
      ".BDDDDDGGDDDDDB.",
      ".BDDDDDDDDDDDDB.",
      ".BDDGGGGGGGGDDB.",
      "..BBBBBBBBBBBB..",
      "................",
    ],
    hero: [
      "................",
      "......RRRR......",
      ".....RRRRRR.....",
      "......BBBB......",
      ".....BSSSSB.....",
      ".....BSWWSB.....",
      ".....BSSSSB.....",
      "....BBBBBBBB....",
      "...BKKKKKKKKB...",
      "..BKKKSSSSKKKB..",
      "..BKKKSSSSKKKB..",
      "..BKKKSSSSKKKB..",
      "...BKKKKKKKKB...",
      "....BSSSSSSB....",
      "....BSS..SSB....",
      "....BB....BB....",
    ],
    monster: [
      "................",
      ".....BBBBBB.....",
      "....BWWWWWWB....",
      "...BWWWWWWWWB...",
      "...BWWRRWWRRB...",
      "...BWWRRWWRRB...",
      "...BWWWWWWWWB...",
      "....BWWBBWWB....",
      "....BWWBBWWB....",
      ".....BBBBBB.....",
      "....BWWWWWWB....",
      "....BWBBBBWB....",
      "....BWWWWWWB....",
      ".....BBBBBB.....",
      "................",
    ],
    gem: [
      "................",
      ".......WW.......",
      "......WGGW......",
      ".....WGGGGW.....",
      "....WGGGGGGW....",
      "...WGGGGGGGGW...",
      "..WGGGGWWGGGGW..",
      ".WGGGGGWWGGGGGW.",
      "..WGGGGWWGGGGW..",
      "...WGGGGGGGGW...",
      "....WGGGGGGW....",
      ".....WGGGGW.....",
      "......WGGW......",
      ".......WW.......",
      "................",
    ],
    badge: [
      "................",
      "..BBBBBBBBBBBB..",
      ".BGGGGGGGGGGGGB.",
      ".BGWWWWWWWWWWGB.",
      ".BGWMMM..MMMWGB.",
      ".BGWMMMMMMMMWGB.",
      ".BGWMMMMMMMMWGB.",
      ".BGW.MMMMMM.WGB.",
      ".BGW..MMMM..WGB.",
      ".BGW...MM...WGB.",
      ".BGWWWWWWWWWWGB.",
      ".BGGGGGGGGGGGGB.",
      "..BBBBBBBBBBBB..",
      "................",
      "................",
      "................",
    ],
  };

  const selectedMatrix = spriteMatrices[spriteType] || spriteMatrices.badge;
  const pixelSize = 16;
  const spriteOffset = 128;

  let pixelRects = "";
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const char = selectedMatrix[r]?.[c];
      const hex = colorMap[char];
      if (hex) {
        const px = spriteOffset + c * pixelSize;
        const py = spriteOffset + r * pixelSize;
        pixelRects += `<rect x="${px}" y="${py}" width="${pixelSize}" height="${pixelSize}" fill="${hex}" />`;
      }
    }
  }

  const safePrompt = cleanPrompt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 512 512" shape-rendering="crispEdges">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0a0915" />
        <stop offset="60%" stop-color="#19152b" />
        <stop offset="100%" stop-color="#2d1b40" />
      </linearGradient>
      <pattern id="pixelGrid" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1" />
      </pattern>
    </defs>
    <!-- Clean Dark Backdrop with Pixel Grid -->
    <rect width="512" height="512" fill="url(#bg)" />
    <rect width="512" height="512" fill="url(#pixelGrid)" />

    <!-- Outer 8-Bit Border Frame -->
    <rect x="24" y="24" width="464" height="464" fill="none" stroke="#6272a4" stroke-width="4" />
    <rect x="32" y="32" width="448" height="448" fill="none" stroke="#ff79c6" stroke-width="2" />

    <!-- Corner Pixel Accents -->
    <rect x="20" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="20" width="12" height="12" fill="#ff79c6" />
    <rect x="20" y="480" width="12" height="12" fill="#ff79c6" />
    <rect x="480" y="480" width="12" height="12" fill="#ff79c6" />

    <!-- 8-Bit Tag Header -->
    <rect x="136" y="48" width="240" height="28" fill="#12121e" stroke="#f1fa8c" stroke-width="2" />
    <text x="256" y="67" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#f1fa8c" text-anchor="middle" letter-spacing="2">LOCAL IMAGE PLACEHOLDER</text>

    <!-- Sprite Shadow Grid -->
    <rect x="${spriteOffset + 12}" y="${spriteOffset + 12}" width="256" height="256" fill="rgba(0,0,0,0.4)" />

    <!-- Scaled 16x16 Pixel Sprite -->
    ${pixelRects}

    <!-- Prompt Footer Badge -->
    <rect x="56" y="416" width="400" height="44" fill="#12121e" stroke="#bd93f9" stroke-width="2" />
    <text x="256" y="442" font-family="'Courier New', monospace" font-size="14" font-weight="bold" fill="#50fa7b" text-anchor="middle" letter-spacing="1">${safePrompt.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function generateWorkersAIImage(
  prompt,
  signal = null,
  options = {},
) {
  try {
    const payload = { prompt };
    const width = Number(options.width);
    const height = Number(options.height);
    const seed = Number(options.seed);
    if (Number.isFinite(width))
      payload.width = Math.min(1920, Math.max(256, Math.round(width)));
    if (Number.isFinite(height))
      payload.height = Math.min(1920, Math.max(256, Math.round(height)));
    if (Number.isFinite(seed)) payload.seed = Math.max(0, Math.round(seed));
    if (typeof options.model === "string" && options.model.trim()) {
      payload.model = options.model.trim();
    }
    const fetchOptions = {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch(WORKERS_AI_IMAGE_ENDPOINT, fetchOptions);
    if (response.ok) {
      const data = await response.json();
      if (data?.image) return data.image;
      console.warn("Workers AI image API responded without an image payload.");
    } else {
      console.warn(
        `Workers AI image API request failed (HTTP ${response.status}).`,
      );
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    console.warn("Workers AI image API request failed.", err);
  }
  return null;
}

export async function generateImage(
  prompt,
  signal = null,
  referenceImage = null,
  options = {},
) {
  const hasReferenceImage =
    typeof referenceImage === "string" &&
    referenceImage.startsWith("data:image");

  if (!hasReferenceImage) {
    const workersImage = await generateWorkersAIImage(prompt, signal, options);
    if (workersImage) return workersImage;
  }

  try {
    const payload = { prompt };
    if (hasReferenceImage) {
      payload.referenceImage = referenceImage;
    }
    const fetchOptions = {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    };
    if (signal) fetchOptions.signal = signal;

    const response = await fetch(IMAGE_PROXY_ENDPOINT, fetchOptions);

    if (response.ok) {
      const data = await response.json();
      if (data?.image) return data.image;
      console.warn(
        "Hosted image API responded without an image payload; rendering a local placeholder.",
      );
    } else {
      console.warn(
        `Hosted image API request failed (HTTP ${response.status}); rendering a local placeholder.`,
      );
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    console.warn(
      "Hosted image API request failed; rendering a local placeholder.",
      err,
    );
  }

  return createFallbackSvgDataUrl(prompt);
}

export function detectRequestedImageModel(prompt, history) {
  const haystack = [
    String(prompt || ""),
    ...(Array.isArray(history)
      ? history.map((m) => String(m?.content || ""))
      : []),
  ]
    .join(" ")
    .toLowerCase();
  if (
    haystack.includes("sdxl-lightning") ||
    haystack.includes("sdxl_lightning") ||
    haystack.includes("stable-diffusion-xl-lightning") ||
    haystack.includes("stable-diffusion-xl-lighting") ||
    haystack.includes("sdxl lightning")
  ) {
    return WORKERS_AI_SDXL_LIGHTNING_MODEL;
  }
  if (haystack.includes("dreamshaper"))
    return "@cf/lykon/dreamshaper-8-lcm";
  if (haystack.includes("sdxl-base") || haystack.includes("sdxl base"))
    return "@cf/stabilityai/stable-diffusion-xl-base-1.0";
  return null;
}

export async function runImageCommand(
  imagePrompt,
  history = [],
  signal = null,
) {
  const cleanPrompt = String(imagePrompt || "").trim();
  if (!cleanPrompt) {
    return "Please tell me what image to generate, e.g. `@image a futuristic city at sunset`";
  }
  const requestedModel = detectRequestedImageModel(cleanPrompt, history);
  const imageUrl = await generateImage(
    cleanPrompt,
    signal,
    extractReferenceImage(history),
    requestedModel ? { model: requestedModel } : {},
  );
  return `![](${imageUrl})`;
}

export function createImageTitle(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return "";

  let subject = clean
    .toLowerCase()
    .replace(/^(please\s+)?(can you|could you|would you|will you)\s+/i, "")
    .replace(
      /^(give me|give us|show me|generate|create|draw|make|render|produce|i want|i need|need|want)\s+(me\s+)?/i,
      "",
    )
    .replace(
      /^(an?\s+)?(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo)\s+(of|for|showing|featuring|with|that|about)\s+/i,
      "",
    )
    .replace(
      /^(an?\s+)?(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo)\s*$/i,
      "",
    )
    .replace(
      /\s+(and|then)?\s*(explain|describe|tell me|what is|what are|why is|why are|how does|how do|what does|what do)\s+.*$/i,
      "",
    )
    .replace(/\s+(for me|please|now)\s*$/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[\]()[]/g, "")
    .trim();

  if (!subject) return "Generated Image";

  const words = subject.split(/\s+/).filter(Boolean);
  const titled = words
    .map((word, index) => {
      if (index === 0 || index === words.length - 1) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      if (IMAGE_TITLE_SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  return titled;
}

export function isMixedQuestionImageRequest(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return false;
  return (
    QUESTION_PATTERNS.test(clean) &&
    /\b(show|give|send|make|draw|generate|get)\s+(me|us)?\s*(an?|the)?\s*(image|picture|photo|illustration|artwork|wallpaper|drawing|graphic|logo|visual|pic|shot)\b/i.test(
      clean,
    ) &&
    isExplicitImageRequest(clean)
  );
}

export function extractImageSubject(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return "";
  let subject = clean.toLowerCase();
  subject = subject
    .replace(
      /^(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\s+(the|an|a)?\s+/i,
      "",
    )
    .replace(
      /^(what is|what are|whats|what's|who is|who are|why is|why are|how does|how do|how is|explain|tell me about|describe|define|meaning of|difference between)\s+/i,
      "",
    )
    .replace(IMAGE_REQUEST_TAIL, "")
    .replace(/\s*[.!?]+$/i, "")
    .trim();
  return subject;
}

export function extractQuestionPrompt(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return "";
  return clean.replace(IMAGE_REQUEST_TAIL, "").trim();
}

export function extractReferenceImage(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (
      !message ||
      message.role !== "user" ||
      !Array.isArray(message.attachments)
    )
      continue;
    for (const attachment of message.attachments) {
      if (
        attachment &&
        typeof attachment.thumb === "string" &&
        attachment.thumb.startsWith("data:image")
      ) {
        return attachment.thumb;
      }
    }
  }
  return null;
}

export async function handleMixedQuestionImageRequest(
  prompt,
  intent,
  history,
  signal,
) {
  const subject = extractImageSubject(prompt);
  const imagePrompt = subject ? `an image of ${subject}` : prompt;

  const questionPrompt = extractQuestionPrompt(prompt) || prompt;
  const questionHistory =
    Array.isArray(history) && history.length > 0
      ? [
          ...compactConversationForRequest(history).slice(0, -1),
          { role: "user", content: questionPrompt },
        ]
      : [];

  const requestedModelMixed = detectRequestedImageModel(prompt, history);
  // The question half is prose; the image is appended separately below. Do
  // not let a design/website intent demand a JSX block from this half.
  const questionIntent = {
    ...intent,
    type: "general_question",
    primaryIntent: "general_question",
    outputFormat: "markdown",
  };

  const [hostedResult, imageResult] = await Promise.allSettled([
    generateHostedAIResponse(questionPrompt, questionIntent, questionHistory, signal),
    generateImage(
      imagePrompt,
      signal,
      extractReferenceImage(history),
      requestedModelMixed ? { model: requestedModelMixed } : {},
    ),
  ]);

  const hostedResponse =
    hostedResult.status === "fulfilled" ? hostedResult.value : null;
  const imageUrl =
    imageResult.status === "fulfilled" ? imageResult.value : null;

  if (imageUrl) {
    const imageMarkdown = `![](${imageUrl})`;
    if (hostedResponse) {
      const tagMatch = hostedResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
      if (tagMatch) return hostedResponse.replace(tagMatch[0], imageMarkdown);
      return `${hostedResponse.trim()}\n\n${imageMarkdown}`;
    }
    return imageMarkdown;
  }

  if (hostedResponse) return hostedResponse;
  throw new Error("Mixed question and image generation both failed.");
}

export function isExplicitImageRequest(prompt) {
  const clean = String(prompt || "").trim();
  if (!clean) return false;

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
  if (
    /\b(?:css|stylesheet|html|javascript|code|function|component|script)\b/i.test(
      clean,
    ) &&
    !/\b(?:image|picture|photo|illustration|wallpaper|artwork|drawing)\b/i.test(
      clean,
    )
  )
    return false;

  const lower = clean.toLowerCase();
  if (
    lower.startsWith("image:") ||
    lower.startsWith("flux:") ||
    lower.startsWith("@image") ||
    lower.startsWith("/image") ||
    lower.startsWith("/imagine") ||
    lower.startsWith("/flux")
  )
    return true;

  if (WRITING_JOB_GUARD.test(clean)) return false;
  if (IMAGE_EDIT_PATTERNS.test(clean)) return true;

  const firstLine = clean.split("\n")[0].trim();
  if (IMAGE_PATTERNS.test(firstLine)) return true;
  if (clean.length < 300 && IMAGE_PATTERNS.test(clean)) return true;

  try {
    const fine = classifyIntentNew(clean);
    if (fine?.type === "image_generation" && (fine.confidence || 0) >= 0.5)
      return true;
  } catch {
    // Classifier unavailable; rely on pattern checks above.
  }
  return false;
}
