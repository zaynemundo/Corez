import { handleSearch } from "./search.js";
import { fetchAwwwardsInspirationCached } from "./inspiration.js";
import { safeErrorDetail } from "./utils.js";
import { toMultimodalMessage } from "./attachmentVision.js";
import {
  parseProjectState,
  deriveProjectState,
  isFollowUpRequest,
  buildProjectContextSection,
} from "./projectState.js";
import {
  detectLiveDataNeed,
  buildRuntimeContext,
  buildRuntimeContextBlock,
} from "./skillVerification.js";
import { buildDataAnalysisContext } from "./artifactPostProcess.js";
import { isGameCreationRequest } from "./systemPrompt.js";

// ---------------------------------------------------------------------
// Attachment metadata block.
//
// Image attachments are sent to the model as real vision input (input_image
// parts built in worker/attachmentVision.js; verified live against the
// gateway's Responses API), while every attachment ALSO gets a metadata hint
// here: kind, name, size, and the authoritative R2 URL to use in markup.
// Video and audio never send pixel/stream bytes — metadata only — and the
// system block below states which of the two cases applies for this request
// so the model never invents a description of something it cannot see.
// Covers: image/*, video/*, audio/*, pdf, text, and generic files.
// ---------------------------------------------------------------------
export function appendAttachmentMetadataMessage({
  messages,
  body,
  imageAttachmentsPresent,
  apiMessages,
}) {
  try {
    const allAttachments = [];
    const seenAttachments = new Set();
    const collectAttachments = (list) => {
      for (const a of Array.isArray(list) ? list : []) {
        const key = String(
          a?.assetUrl || a?.thumb || a?.name + "|" + a?.type || "",
        );
        if (!key || seenAttachments.has(key)) continue;
        seenAttachments.add(key);
        if (
          a?.thumb ||
          a?.assetUrl ||
          (typeof a?.content === "string" && a.content.trim()) ||
          a?.type
        ) {
          allAttachments.push(a);
        }
      }
    };
    for (const m of Array.isArray(messages) ? messages : []) {
      collectAttachments(m?.attachments);
    }
    collectAttachments(body?.attachments);

    if (allAttachments.length > 0) {
      const directAssetHints = allAttachments
        .map((a) => {
          const mime = String(a.type || "").toLowerCase();
          const kind = mime.startsWith("image/")
            ? "image"
            : mime.startsWith("video/")
              ? "video"
              : mime.startsWith("audio/")
                ? "audio"
                : "file";
          const hasR2 =
            a?.assetUrl && String(a.assetUrl).includes("/api/assets/");
          const hasThumb = a?.thumb && String(a.thumb).startsWith("data:");
          const hasContent =
            typeof a?.content === "string" && a.content.trim();
          const sizeHint = a.size ? " (" + (a.size / 1024).toFixed(1) + "KB)" : "";
          if (hasR2) {
            const raw = String(a.assetUrl);
            const absoluteUrl = raw.startsWith("http")
              ? raw
              : "https://corez.pro" + (raw.startsWith("/") ? "" : "/") + raw;
            return `[Attached ${kind} "${a.name}"${sizeHint} R2 URL: ${absoluteUrl} - USE THIS EXACT URL (must start with https://corez.pro/api/assets/) for <img>/<video>/<audio> src, never hallucinate a local filename like "${a.name}"]`;
          }
          if (hasThumb) {
            return (
              '[Attached ' +
              kind +
              ' "' +
              a.name +
              '"' +
              sizeHint +
              " available as a data URL thumb - for <img src> use the data URL when no R2 URL exists]"
            );
          }
          if (hasContent) {
            return (
              '[Attached file "' +
              a.name +
              '"' +
              sizeHint +
              " has extracted text content (" +
              a.content.length +
              " chars) supplied separately]"
            );
          }
          return (
            '[Attached ' +
            kind +
            ' "' +
            a.name +
            '" (' +
            (mime || "unknown") +
            ")" +
            sizeHint +
            " - metadata only]"
          );
        })
        .filter(Boolean)
        .join("\n");
      if (directAssetHints) {
        apiMessages.push({
          role: "system",
          content: imageAttachmentsPresent
            ? "Attached media (images ARE visible to you — their pixels are supplied; video and audio are metadata only):\n" +
              directAssetHints +
              "\nUse the exact URLs above for markup. Image attachments are readable: describe, analyse and recreate them directly. Video and audio content is NOT available to you — if asked about those, say plainly that you cannot see the stream. Extracted text content, when present, is supplied elsewhere in this conversation and may be used normally."
            : "Attached media (metadata only - you cannot see image, video or audio content):\n" +
              directAssetHints +
              "\nThese files exist and their URLs are authoritative for markup. Their visual content is NOT available to you. If the user asks you to describe, analyse, OCR or recreate an attachment, say plainly that you cannot see the file and ask them to describe it or paste the relevant text - never invent a description, and never produce a generic layout/typography/colour template as if you had seen it. Extracted text content, when present, is supplied elsewhere in this conversation and may be used normally.",
        });
      }
    }
  } catch (attachmentErr) {
    console.warn(
      "Attachment metadata block failed (continuing):",
      attachmentErr?.message || attachmentErr,
    );
  }
}

// ---------------------------------------------------------------------
// Skill Verification Layer — runtime context + live-data grounding.
// Requests that need fresh external data (currency, weather, research
// with citations) are grounded in a REAL web search BEFORE generation so
// the model answers from evidence, never from memory. A search failure is
// honest: no live evidence is injected and the verifier flags answers
// that still present current values as fabricated.
// ---------------------------------------------------------------------
export async function resolveLiveGroundingAndSkillContext({
  prompt,
  executionPrompt,
  skills,
  env,
  apiMessages,
}) {
  const runtimeContext = buildRuntimeContext();
  const liveDataNeed = detectLiveDataNeed(executionPrompt || prompt);
  const specialistIds = Array.isArray(skills)
    ? skills.map((s) => (typeof s === "string" ? s : s.id)).filter(Boolean)
    : [];
  if (specialistIds.includes("data-analysis")) {
    const dataContext = buildDataAnalysisContext(executionPrompt || prompt);
    if (dataContext) apiMessages.push({ role: "system", content: dataContext });
  }
  const needsGrounding =
    liveDataNeed.required || specialistIds.includes("research-report");
  let liveDataEvidence = null;
  if (needsGrounding && env?.__DISABLE_LIVE_GROUNDING !== "true") {
    apiMessages.push({
      role: "system",
      content: buildRuntimeContextBlock(runtimeContext),
    });
    try {
      const searchRequest = new Request("https://corez.test/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: executionPrompt || prompt,
          detail: true,
        }),
      });
      const searchResult = await handleSearch(searchRequest, env);
      if (searchResult.ok) {
        const data = await searchResult.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          liveDataEvidence = {
            servedAt: data.meta?.servedAt || new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
            sources: Array.isArray(data.meta?.sources)
              ? data.meta.sources
              : ["web-search"],
            results: data.results,
            maxAgeMs: 12 * 60 * 60 * 1000,
          };
          const snippets = data.results
            .slice(0, 8)
            .map(
              (r) =>
                `- ${r.title} | ${r.url} | ${String(r.snippet || "").slice(0, 300)}${r.extract ? ` | ${String(r.extract).slice(0, 1200)}` : ""}`,
            )
            .join("\n");
          const softLiveKinds = new Set(["freshness", "media-releases"]);
          const liveInstruction = liveDataNeed.required
            ? softLiveKinds.has(liveDataNeed.kind)
              ? `This request may need CURRENT data (${liveDataNeed.kind}). Use the search results below when they contain current information for the request, and cite the source URLs you used. If the results do NOT answer the question, answer from your knowledge and note that you could not verify current information.`
              : `This request needs CURRENT data (${liveDataNeed.kind}). Answer ONLY from the search results below; state the source URL and timestamp. NEVER use remembered values. If the results do not contain the current value, say clearly that live data could not be retrieved.`
            : `Use the search results below as the research evidence for your answer. Cite the actual source URLs. Do NOT invent citations or claims not supported by these results.`;
          apiMessages.push({
            role: "system",
            content: `${liveInstruction}\n\nLive search results (fetched at ${liveDataEvidence.fetchedAt}):\n${snippets}`,
          });
        }
      }
    } catch (err) {
      console.warn(
        "Live grounding search failed (request continues without live evidence):",
        safeErrorDetail(err),
      );
    }
  }
  return { runtimeContext, liveDataNeed, liveDataEvidence };
}

export async function appendConversationAndInspirationMessages({
  prompt,
  executionPrompt,
  intent,
  fineIntent,
  legacyIntent,
  intentType,
  skills,
  body,
  messages,
  lastUserMessage,
  imageAttachmentsPresent,
  env,
  apiMessages,
}) {
  // Fast path for general intents: explanations, writing, and casual chat are
  // answered from the last few turns only, so they come back quickly. Coding,
  // app, and game requests keep the FULL history. NO output caps exist
  // anywhere: every provider call runs uncapped, so reasoning models can think
  // as long as they need and deliverables are never cut off mid-generation.
  const primaryIntent = intent?.primaryIntent || legacyIntent || intentType;
  const specialistSkills =
    Array.isArray(skills) && skills.length > 0
      ? skills.map((s) => (typeof s === "string" ? s : s.id)).filter(Boolean)
      : [];
  const isFastIntent =
    ["explanation", "general", "writing"].includes(intentType) &&
    ![
      "bug_fix",
      "code_refactor",
      "feature_implementation",
      "simple_edit",
      "code_question",
      "app",
      "website_creation",
      "game_creation",
      "design_task",
    ].includes(primaryIntent) &&
    intentType !== "app" &&
    specialistSkills.length === 0;
  const fastHistoryWindow = Math.max(
    2,
    Math.min(8, body.fastHistoryWindow || 8),
  );

  const fastMessages = isFastIntent
    ? messages.filter((m) => m.role && m.content).slice(-fastHistoryWindow)
    : messages;

  // Live Awwwards inspiration for app/site requests: real award-winning
  // site references (title + URL) are injected into the system prompt so the
  // model has concrete visual direction. Best-effort: failure never blocks
  // the request and never fabricates references.
  const appIntent = intent?.type === "app" || legacyIntent === "app";
  const gameIntent = isGameCreationRequest(prompt, intent, fineIntent);
  if (appIntent && !gameIntent) {
    try {
      const inspiration = await fetchAwwwardsInspirationCached(
        env,
        prompt,
        env?.__INSPIRATION_FETCH || fetch,
      );
      if (Array.isArray(inspiration?.sites) && inspiration.sites.length > 0) {
        const refs = inspiration.sites
          .map((site) => {
            let line = `- ${site.title} — ${site.url}`;
            if (site.liveUrl) line += ` (Live site: ${site.liveUrl})`;
            if (site.description)
              line += `\n  Design approach: ${site.description}`;
            if (site.tags && site.tags.length > 0)
              line += `\n  Visual elements: ${site.tags.join(", ")}`;
            return line;
          })
          .join("\n\n");
        apiMessages.push({
          role: "system",
          content: `Live design inspiration (${inspiration.category} category):\n${refs}\n\nUse these award-winning sites as visual references for layout, typography, colour, and interaction quality. Use them as design direction. NEVER mention "Awwwards" or "Awwwards-inspired" in your response text to the user.`,
        });
      }
    } catch (error) {
      console.warn(
        "Awwwards inspiration fetch failed (request continues):",
        safeErrorDetail(error),
      );
    }
  }

  let hasAppendedPrompt = false;
  for (const m of fastMessages) {
    if (m.role && m.content) {
      const converted = toMultimodalMessage(
        {
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          attachments: m.attachments,
        },
        // Pixels only for the current turn's message (the one the user just
        // sent); assistant turns and older history stay text/metadata.
        { vision: imageAttachmentsPresent && m === lastUserMessage },
      );
      apiMessages.push(converted);
      const contentStr =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? JSON.stringify(m.content)
            : String(m.content || "");
      const targetPrompt = executionPrompt || prompt;
      if (
        m.role === "user" &&
        typeof targetPrompt === "string" &&
        contentStr.includes(
          targetPrompt.slice(0, Math.min(80, targetPrompt.length)),
        )
      ) {
        hasAppendedPrompt = true;
      } else if (
        m.role === "user" &&
        contentStr.includes(prompt.slice(0, Math.min(80, prompt.length)))
      ) {
        hasAppendedPrompt = true;
      }
    }
  }

  if (!hasAppendedPrompt) {
    apiMessages.push({ role: "user", content: executionPrompt || prompt });
  }

  // State-aware follow-ups: build/merge lightweight project memory so a
  // modification request edits the existing implementation instead of
  // regenerating it.
  const clientProject = parseProjectState(body.project);
  const derivedProject = deriveProjectState(messages);
  const activeProject = clientProject || derivedProject;
  const isFollowUp = isFollowUpRequest(prompt, activeProject);
  if (isFollowUp && activeProject) {
    apiMessages.push({
      role: "system",
      content: buildProjectContextSection(activeProject, prompt),
    });
  }

  return { activeProject, hasAppendedPrompt };
}
