import { fetchWebSearch } from "../searchService.js";
import { synthesizePdfDocumentHtml } from "../pdfGenerator.js";
import {
  analyzePublicUserIntent,
  generateHostedAIResponse,
  isRevisionContextPrompt,
} from "../aiService.js";

export function isWebSearchRequest(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (!text.trim()) return false;
  // A code revision — or any prompt that carries a code block — is never a web
  // search. Game and app source is full of words that satisfy the freshness
  // vocabulary below ("score", "event", "update", "release", "launch",
  // "current", "live"), so a revision like "add recoil and ammo" searched the
  // web for the whole artifact and came back with Unity/Roblox tutorials that
  // have nothing to do with editing this game.
  if (
    text.includes("```") ||
    /\[context:|\[existing code to revise/i.test(text) ||
    isRevisionContextPrompt(text)
  ) {
    return false;
  }
  const searchPhrase =
    /\b(search|look up|lookup|google|browse|find out|fetch|retrieve|check)\b[\s\S]{0,60}\b(web|internet|online|current|latest|recent|news|updates?|today|now|live|real[- ]?time)\b/i;
  const factualRecency =
    /\b(what|who|which|where|when|how)\b[\s\S]{0,80}\b(happened|occurred|happening|won|winner|released|launched|announced|published|updated|changed|result|score|price|rate|weather|temperature|stock|cases)\b/i;
  if (searchPhrase.test(text) || factualRecency.test(text)) return true;

  // Generic freshness / status questions the enumerated rules above miss:
  // "what's new in AI?", "anything new from Vite?", "the latest iPhone",
  // "is LOOM still active?", "the latest music Imagine Dragons created".
  // Local-context questions ("what's new in my game?", "are you still making
  // games?", "next song in my playlist") never trigger a search.
  const whatIsNew =
    /\bwhat('s| is| are)\s+new\s+(?:in|with|from|about)\s+(?!(?:my|our|your|the)\s+(?:app|game|site|code|website|project)\b)\b[A-Za-z0-9][\w .'-]{0,30}\b/i;
  const anythingNew =
    /\b(?:anything|something)\s+new\b[\s\S]{0,40}\b(?:from|with|about)\b/i;
  const productFreshness =
    /\b(latest|newest|current)\s+(?:model|version|iphone|smartphone|console|device|software|update|release|album|single|song|music)\b/i;
  const statusFreshness =
    /\b(?:is|are|has|have)\s+(?!(?:you|your|we|our|i)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*)?\s+still\s+(?:active|around|together|releasing|making|performing|touring)\b/i;
  const releaseFreshness =
    /\b(latest|newest|recent|upcoming)\s+(?:[A-Za-z][\w'-]*\s+){0,3}(?:singles?|albums?|tracks?|ep|mixtapes?|music|music videos?|releases?|songs?)\b/i;
  if (
    whatIsNew.test(text) ||
    anythingNew.test(text) ||
    productFreshness.test(text) ||
    statusFreshness.test(text) ||
    releaseFreshness.test(text)
  )
    return true;

  const recency =
    /\b(latest|current|recent|today|yesterday|this (week|month|year)|right now|as of|breaking|live|newly|up[- ]to[- ]date|202[4-9]|20\d\d)\b/i;
  if (!recency.test(text)) return false;

  const newsy =
    /\b(news|headlines|event|happening|happened|developments?|updates?|announcement|release|launch|score|results?|forecast|weather|temperature|election|awards?|winners?|match|game (today|tonight)|schedule)\b/i;
  return newsy.test(text);
}

// Format search results into a compact, honest summary used when the hosted
// AI is unavailable. Every result keeps its source URL; nothing is invented.
export function formatSearchResults(search) {
  const results = Array.isArray(search?.results) ? search.results : [];
  if (results.length === 0) {
    return "I searched the web but no reliable results came back for that query.";
  }
  const lines = results.map((result, index) => {
    const title = result.title || "Result";
    const url = result.url ? `\n   ${result.url}` : "";
    const snippet = result.snippet ? `\n   ${result.snippet}` : "";
    const source = result.source ? ` (${result.source})` : "";
    return `${index + 1}. **${title}**${source}${url}${snippet}`;
  });
  // Never print a placeholder as if it were the query: a missing query renders
  // "your request" instead of the literal word "undefined".
  const queryLabel =
    typeof search?.query === "string" && search.query.trim()
      ? search.query.trim()
      : "your request";
  return `I searched the web for **"${queryLabel}"** and found these sources:\n\n${lines.join("\n\n")}\n\n_Results are search summaries; open the sources for full details._`;
}

// Answer a web-search request: prefer the hosted AI with the real search
// results as grounding; when it is unavailable, present the sources directly.
export async function answerWithWebSearch(
  cleanPrompt,
  intent,
  history,
  signal,
) {
  const search = await fetchWebSearch(cleanPrompt, signal);
  if (!Array.isArray(search?.results) || search.results.length === 0) {
    return "I searched the web for that, but no usable results came back.";
  }

  const grounded = await (async () => {
    try {
      const groundedPrompt = `The user asked: "${cleanPrompt}"

Use the following web search results as your factual grounding. Answer the user's question with real, current information from these results. Always name the source(s) you used (title + URL). If the results do not contain the answer, say so honestly instead of guessing. Do NOT invent URLs or facts.

SEARCH RESULTS:
${search.results.map((result, index) => `${index + 1}. ${result.title} — ${result.url}\n   ${result.snippet || ""} (source: ${result.source})`).join("\n")}`;
      const hosted = await generateHostedAIResponse(
        groundedPrompt,
        intent,
        history,
        signal,
      );
      if (hosted) return hosted;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn(
        "Hosted AI unavailable for grounded search answer; showing sources.",
        error,
      );
    }
    return null;
  })();

  if (grounded) return grounded;
  return formatSearchResults(search);
}

// Deep research pipeline for the /research command, structured after the
// two-phase Deep Research skill methodology (Weizhena/Deep-Research-skills,
// MIT): Phase 1 decomposes the topic into research items with focused search
// queries; Phase 2 runs a dedicated web search per item (Wikipedia +
// DuckDuckGo through the worker, with full article extracts); Phase 3
// synthesises a deep report with a table of contents and per-item sections,
// then an editorial verification pass over the draft; the report is delivered
// as a downloadable PDF in the preview canvas.
const DEEP_RESEARCH_MAX_ITEMS = 5;
const DEEP_RESEARCH_MAX_EXTRACT_CHARS = 3000;
const DEEP_RESEARCH_MAX_DRAFT_CHARS = 24000;

// Parse the hosted AI's outline answer (strict JSON: {"items":[{name,query}]}).
// Returns a bounded, sanitized item list or null when the answer is unusable.
export function extractOutlineItems(text) {
  if (!text) return null;
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    if (!Array.isArray(data?.items)) return null;
    const items = data.items
      .map((item, index) => ({
        name:
          String(item?.name || "")
            .trim()
            .slice(0, 80) || `Item ${index + 1}`,
        query: String(item?.query || "")
          .trim()
          .slice(0, 200),
      }))
      .filter((item) => item.name && item.query);
    if (items.length === 0) return null;
    return items.slice(0, DEEP_RESEARCH_MAX_ITEMS);
  } catch {
    return null;
  }
}

// Deduplicate sources by URL (fall back to title) preserving first occurrence.
export function dedupeSources(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((s) => {
    const key = (s && s.url) || (s && s.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runResearchCommand(topic, history = [], signal = null) {
  const cleanTopic = String(topic || "").trim();
  if (!cleanTopic) {
    return "Please tell me what to research, e.g. `@research quantum computing`";
  }

  // Phase 1a: topic-level search — also grounds the outline decomposition.
  let search;
  try {
    search = await fetchWebSearch(cleanTopic, signal, { detail: true });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    const detail =
      typeof error?.detail === "string" && error.detail.trim()
        ? ` (${error.detail.trim().slice(0, 200)})`
        : "";
    return `I couldn't research "${cleanTopic}" right now — the web search service is unavailable${detail}. Please try again later.`;
  }
  const results = Array.isArray(search?.results) ? search.results : [];
  if (results.length === 0) {
    return `I searched the web for **"${cleanTopic}"** but no reliable results came back, so I can't write a grounded research report about it. Try a different topic.`;
  }

  const resultsText = results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title} — ${result.url}\n   ${result.snippet || ""} (source: ${result.source})`,
    )
    .join("\n");

  // Phase 1b: outline decomposition
  let items = null;
  try {
    const outlinePrompt = `You are a research outline planner. Topic: "${cleanTopic}".

Decompose this topic into the key research items a deep report must cover (entities, products, people, sub-topics, technologies). For each item give a focused, self-contained web search query.

Return ONLY a JSON object with no commentary, in exactly this shape:
{"items":[{"name":"Item name","query":"focused search query"}]}

Rules:
- 2 to ${DEEP_RESEARCH_MAX_ITEMS} items, ordered by importance.
- Each query must be self-contained (carry the topic context), 3 to 12 words, and specific enough to return item-focused results.
- Prefer items grounded in the search results below; do not invent URLs or facts.

TOPIC-LEVEL SEARCH RESULTS:
${resultsText}`;
    const hosted = await generateHostedAIResponse(
      outlinePrompt,
      analyzePublicUserIntent(cleanTopic),
      history,
      signal,
    );
    if (hosted) items = extractOutlineItems(hosted);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  // Phase 2: one dedicated search per item, run in parallel.
  const itemResults =
    Array.isArray(items) && items.length > 0
      ? await (async () => {
          const settled = await Promise.allSettled(
            items.map((item) =>
              fetchWebSearch(item.query, signal, { detail: true }),
            ),
          );
          if (signal?.aborted) {
            const abort = new Error("Aborted");
            abort.name = "AbortError";
            throw abort;
          }
          return settled.map((outcome) =>
            outcome.status === "fulfilled" &&
            Array.isArray(outcome.value?.results)
              ? outcome.value.results
              : [],
          );
        })()
      : [];
  const researched = Array.isArray(items) && items.length > 0;

  const globalSources = dedupeSources(
    researched ? [...results, ...itemResults.flat()] : results,
  );
  const indexByKey = new Map(
    globalSources.map((source, index) => [source.url || source.title, index]),
  );

  function sourceLine(source) {
    return `${(indexByKey.get((source && source.url) || (source && source.title)) ?? 0) + 1}. ${source.title || "Source"} — ${source.url || ""}`;
  }

  function itemBlock(item, index) {
    const sources = itemResults[index] || [];
    if (sources.length === 0) {
      return `### Item: ${item.name}\n(no dedicated results returned for query "${item.query}"; covered by the topic-level sources above)`;
    }
    const lines = sources.map((source) => {
      const extract =
        typeof source.extract === "string" && source.extract.trim()
          ? `\n   FULL EXTRACT: ${source.extract.trim().slice(0, DEEP_RESEARCH_MAX_EXTRACT_CHARS)}`
          : "";
      return `${sourceLine(source)}\n   ${source.snippet || ""}${extract}`;
    });
    return `### Item: ${item.name} (query: "${item.query}")\n${lines.join("\n")}`;
  }

  const outlineSection = researched
    ? `\n\nRESEARCH ITEMS (deep-researched individually):\n${items.map((item, index) => `${index + 1}. ${item.name} — ${item.query}`).join("\n")}\n\nITEM SOURCES:\n${items.map((item, index) => itemBlock(item, index)).join("\n\n")}`
    : "";

  const globalSourcesText = globalSources
    .map(
      (source, index) =>
        `${index + 1}. ${source.title} — ${source.url}\n   ${source.snippet || ""} (source: ${source.source})`,
    )
    .join("\n");

  // Phase 3a: deep synthesis
  let reportBody = "";
  try {
    const researchPrompt = `Write a detailed, comprehensive deep research report on: "${cleanTopic}"

RESEARCH METHOD:
- First, frame the precise research question this report answers and its scope.
- Use ONLY the sources below as factual grounding. Citations [n] refer to the globally numbered source list.
- Cite every claim inline as [n]. Where a claim is not supported by the sources, say so explicitly instead of guessing. Never invent facts, URLs, or sources.
- Synthesize across sources: where sources disagree or cover different aspects, say so explicitly and resolve the contradiction when the evidence allows.
${researched ? `- Cover EVERY researched item in its own section, drawing on its dedicated sources (and full extracts) for depth.` : ""}

REPORT STRUCTURE (produce ALL sections):
## Table of Contents
1. ${researched ? items.map((item) => item.name).join("\n2. ") : "Overview"}
(plus any cross-cutting sections you add)

## Research Question & Scope
The precise question this report answers and what it deliberately does not cover.

## Overview
A concise orientation for a general reader.

## Key Findings
The most important, evidence-backed conclusions, each cited.
${researched ? `\n${items.map((item) => `## Item: ${item.name}\nDedicated analysis of this item with multiple paragraphs, drawing on its full article extracts for depth (background, context, specifics, examples).`).join("\n\n")}` : "\n## Detailed Analysis\nThe core of the report: examine each notable subject in its own subsection with multiple paragraphs, drawing on the full article extracts for depth."}

## Cross-Cutting Synthesis
How the items relate, compare, and combine into the full picture of "${cleanTopic}".

## Contradictions & Unresolved Questions
Where the sources disagree, what remains unknown, and where evidence is thin.

## Conclusion
Synthesise the findings and answer the research question directly.

Aim for a thorough, in-depth report (roughly 1200+ words), not a summary. Write clear, well-structured prose.

SOURCES:
${globalSourcesText}
${outlineSection}`;
    const hosted = await generateHostedAIResponse(
      researchPrompt,
      analyzePublicUserIntent(cleanTopic),
      history,
      signal,
    );
    if (hosted) reportBody = hosted;
  } catch (error) {
    if (error?.name === "AbortError") throw error;
  }

  // Phase 3b: editorial verification pass
  if (reportBody) {
    try {
      const reviewPrompt = `You are an editorial reviewer for a deep research report. Critically review the draft against the source list:
- Every claim must be traceable to a source: flag and correct any claim that is not supported.
- Fix contradictions, overreach, and missing evidence in the final text.
- Keep the structure (table of contents, per-item sections) and all accurate, well-supported content; do not add facts that are not in the sources.
Then output THE FINAL REVISED REPORT ONLY (no review commentary, no preamble).

SOURCES:
${globalSourcesText}

DRAFT:
${reportBody.slice(0, DEEP_RESEARCH_MAX_DRAFT_CHARS)}`;
      const revised = await generateHostedAIResponse(
        reviewPrompt,
        analyzePublicUserIntent(cleanTopic),
        history,
        signal,
      );
      if (revised) reportBody = revised;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }

  if (!reportBody) {
    const fallbackSections = researched
      ? items
          .map((item, index) => {
            const sources = itemResults[index] || [];
            if (sources.length === 0)
              return `## Item: ${item.name}\n\nNo dedicated results returned for this item during the run.`;
            return `## Item: ${item.name}\n\n${sources
              .map(
                (r) =>
                  `- ${r.title}: ${(r.extract || r.snippet || "See source for details.").slice(0, 600)} — ${r.url}`,
              )
              .join("\n")}`;
          })
          .join("\n\n")
      : `## Detailed Analysis\n\n${results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title} — ${r.url}\n   ${(r.extract || r.snippet || "See source for details.").slice(0, 600)}`,
          )
          .join("\n\n")}`;
    reportBody = `# Deep Research Report: ${cleanTopic}

## Research Question & Scope

This report answers: what does the available evidence say about "${cleanTopic}"? It is grounded strictly in the live web search results listed below.

## Table of Contents
${researched ? items.map((item, index) => `${index + 1}. ${item.name}`).join("\n") : "1. Overview\n2. Sources"}

## Key Findings

${(researched ? itemResults.flat() : results)
  .slice(0, 6)
  .map((r) => `- ${r.title}: ${r.snippet || "See source for details."}`)
  .join("\n")}

${fallbackSections}

## Contradictions & Unresolved Questions

The hosted model was unavailable during this run, so the excerpts above are presented directly from the sources without cross-source synthesis.

_Generated by CoreZ from live web search results._`;
  }

  const plainBody = reportBody.replace(/```/g, "").trim();
  const title = `${cleanTopic.slice(0, 60)} — Research Report`;
  const pdf = synthesizePdfDocumentHtml({
    title,
    body: plainBody,
    sources: globalSources,
  });

  const depthNote = researched
    ? ` — **${items.length} items** deep-researched across ${globalSources.length} sources`
    : "";
  return `Here is your deep research report on **${cleanTopic}**${depthNote}, grounded in live web search results. Open it in the preview canvas and click **"Download .pdf"** to save it as a PDF, or **"Print / Save as PDF"** to print it.\n\n\`\`\`html\n${pdf.html}\n\`\`\``;
}
