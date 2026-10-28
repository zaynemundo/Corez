import {
  evaluateResponse,
  repairResponse,
  ensureGameChatBrief,
  ensureSiteChatBrief,
  recordQualitySignal,
} from "../reflectionEngine.js";
import { stripThinkingBlocks } from "../../../packages/agent-core/providers/text.js";
import { sleepResumable } from "./retryPolicy.js";

const CLOUDFLARE_CHALLENGE_PATTERN =
  /Just a moment|challenge-platform|__cf_chl_/i;
const TRANSPORT_FAILURE_PATTERN =
  /networkerror|failed to fetch|load failed|fetch failed|connection (refused|reset|timed out)|network is unreachable|err_connection/i;

export function createHostedFetcher({
  signal,
  primaryEndpoint,
  fallbackEndpoint,
}) {
  const fetchWithTransportRetry = async (
    options,
    endpoint = primaryEndpoint,
  ) => {
    const attempts = [null, 3000];
    for (let i = 0; i < attempts.length; i += 1) {
      if (signal?.aborted) {
        const err = new Error("AbortError");
        err.name = "AbortError";
        throw err;
      }
      try {
        return await fetch(endpoint, options);
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) throw err;
        const message = `${err?.message || ""} ${err?.cause?.message || ""}`;
        const isLastAttempt = i === attempts.length - 1;
        if (!TRANSPORT_FAILURE_PATTERN.test(message) || isLastAttempt)
          throw err;
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, attempts[i + 1]);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
    throw new Error("Hosted AI request failed to reach the AI worker.");
  };

  const fallbackAnswerIsUsable = (fallback) =>
    Boolean(fallback) && fallback.status !== 401 && fallback.status !== 403;

  const fetchHostedResponse = async (options) => {
    let response;
    try {
      response = await fetchWithTransportRetry(options, primaryEndpoint);
    } catch (err) {
      if (err?.name === "AbortError" || signal?.aborted) throw err;
      let fallback;
      try {
        fallback = await fetchWithTransportRetry(options, fallbackEndpoint);
      } catch (fallbackErr) {
        if (fallbackErr?.name === "AbortError" || signal?.aborted)
          throw fallbackErr;
        throw err;
      }
      if (fallback.status === 401) throw err;
      return fallback;
    }

    if (response.status === 403) {
      let challengePage = response.headers.get("cf-mitigated") === "challenge";
      if (!challengePage) {
        try {
          const body = await response.clone().text();
          challengePage = CLOUDFLARE_CHALLENGE_PATTERN.test(
            body.slice(0, 4000),
          );
        } catch {
          /* keep header-based result */
        }
      }
      if (challengePage) {
        try {
          const fallback = await fetchWithTransportRetry(
            options,
            fallbackEndpoint,
          );
          if (fallbackAnswerIsUsable(fallback)) return fallback;
        } catch (fallbackErr) {
          if (fallbackErr?.name === "AbortError" || signal?.aborted)
            throw fallbackErr;
        }
        return response;
      }
    }

    if ([502, 503, 504].includes(response.status)) {
      try {
        const fallback = await fetchWithTransportRetry(
          options,
          fallbackEndpoint,
        );
        if (fallbackAnswerIsUsable(fallback)) return fallback;
      } catch (fallbackErr) {
        if (fallbackErr?.name === "AbortError" || signal?.aborted)
          throw fallbackErr;
      }
    }

    return response;
  };

  return fetchHostedResponse;
}

export async function runHostedSseStream({
  fetchHostedResponse,
  fetchOptions,
  options,
  useCreationHarness,
  signal,
  fineIntent,
  intent,
  prompt,
  onProjectState,
}) {
  const MAX_STREAM_ATTEMPTS = useCreationHarness ? 4 : 3;
  const STREAM_RETRY_DELAYS_MS = Array.isArray(options.retryDelaysMs)
    ? options.retryDelaysMs
    : useCreationHarness
      ? [15_000, 60_000, 240_000]
      : [2_000, 8_000];
  const waitWithAbort = async (ms) => {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  };

  for (let attempt = 0; attempt < MAX_STREAM_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      const err = new Error("AbortError");
      err.name = "AbortError";
      throw err;
    }
    if (attempt > 0) options.onClear?.();

    const response = await fetchHostedResponse(fetchOptions);
    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch {
        /* keep empty */
      }
      if (response.status === 401) {
        throw new Error("Authentication required. Please log in.");
      }
      if (response.status === 402) {
        let planMessage = "";
        try {
          planMessage = String(JSON.parse(errorText)?.error || "");
        } catch {
          /* not JSON */
        }
        throw new Error(
          planMessage ||
            "You have used up your plan's monthly allowance. Upgrade in Settings → Billing to keep going.",
        );
      }
      if (
        response.status === 403 &&
        CLOUDFLARE_CHALLENGE_PATTERN.test(errorText.slice(0, 4000))
      ) {
        throw new Error(
          "The hosted AI request was intercepted by a security challenge page before reaching the worker. The site needs a WAF bypass rule for /api/* — please retry in a moment.",
        );
      }
      throw new Error(
        `Hosted AI stream failed: HTTP ${response.status} ${errorText.slice(0, 200)}`,
      );
    }
    if (!response.body) throw new Error("Hosted AI stream had no body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamed = "";
    let rawBody = "";
    let projectState = null;
    let sawDone = false;
    let sawPhase = false;
    let retryableError = null;
    const handleSseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload) return;
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      if (event.type === "delta" && typeof event.text === "string") {
        streamed += event.text;
        options.onDelta?.(event.text);
      } else if (event.type === "thinking" && typeof event.text === "string") {
        options.onThinking?.(event.text);
      } else if (event.type === "clear") {
        streamed = "";
        options.onClear?.();
      } else if (event.type === "phase" && typeof event.phase === "string") {
        sawPhase = true;
        options.onPhase?.(event);
      } else if (event.type === "done") {
        sawDone = true;
        if (event.projectState) projectState = event.projectState;
      } else if (event.type === "error") {
        if (event.retryable === true && attempt < MAX_STREAM_ATTEMPTS - 1) {
          retryableError = event;
        } else {
          throw new Error(event.message || "Hosted AI stream error.");
        }
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim()) handleSseLine(buffer);
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      if (rawBody.length < 200 * 1024) rawBody += chunk;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) handleSseLine(line);
      if (retryableError) break;
    }
    if (retryableError) {
      await reader.cancel().catch(() => {});
    }
    if (projectState) {
      onProjectState(projectState);
    }

    const rawTrimmed = rawBody.trim();
    const interrupted =
      useCreationHarness &&
      !sawDone &&
      (sawPhase || !rawTrimmed || streamed.trim());
    if (
      (retryableError || interrupted) &&
      attempt < MAX_STREAM_ATTEMPTS - 1 &&
      !signal?.aborted
    ) {
      const retryAfterMs =
        Number(retryableError?.retryAfterSeconds) > 0
          ? Math.min(Number(retryableError.retryAfterSeconds) * 1000, 120_000)
          : (STREAM_RETRY_DELAYS_MS[attempt] ?? 240_000);
      options.onPhase?.({
        phase: "resuming",
        attempt: attempt + 1,
        total: MAX_STREAM_ATTEMPTS,
        retryAfterMs,
      });
      await waitWithAbort(retryAfterMs);
      continue;
    }
    if (retryableError) {
      throw new Error(retryableError.message || "Hosted AI stream error.");
    }
    if (streamed.trim()) {
      const streamIntent =
        fineIntent?.primaryIntent ||
        fineIntent?.type ||
        intent?.primaryIntent ||
        intent?.type;
      if (
        useCreationHarness ||
        ["game_creation", "website_creation", "design_task", "app"].includes(
          streamIntent,
        )
      ) {
        return ensureSiteChatBrief(ensureGameChatBrief(streamed), prompt);
      }
      return streamed;
    }

    if (!rawTrimmed) {
      throw new Error(
        "The hosted AI returned an empty response. Please try again.",
      );
    }
    if (CLOUDFLARE_CHALLENGE_PATTERN.test(rawTrimmed.slice(0, 4000))) {
      throw new Error(
        "The hosted AI request was intercepted by a security challenge page instead of reaching the worker. Please retry in a moment.",
      );
    }
    if (rawTrimmed.startsWith("{") || rawTrimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawTrimmed);
        if (typeof parsed?.content === "string" && parsed.content.trim()) {
          return parsed.content;
        }
        if (typeof parsed?.error === "string") {
          throw new Error(`Hosted AI request failed: ${parsed.error}`);
        }
      } catch (jsonErr) {
        if (
          jsonErr instanceof Error &&
          jsonErr.message.startsWith("Hosted AI request failed:")
        )
          throw jsonErr;
      }
    }
    throw new Error("Hosted AI returned no streamed content.");
  }
  throw new Error("Hosted AI returned no streamed content.");
}

export async function executeNonStreamingHostedCall({
  fetchHostedResponse,
  fetchOptions,
  signal,
  contract,
  fineIntent,
  resolvedSkillsCount,
  onProjectState,
}) {
  let response = await fetchHostedResponse(fetchOptions);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (err?.name === "AbortError" || signal?.aborted) throw err;
    data = {};
  }

  const RETRY_SCHEDULED_MAX_ATTEMPTS = 3;
  const RETRY_SCHEDULED_MIN_WAIT_MS = 500;
  const RETRY_SCHEDULED_MAX_WAIT_MS = 120000;
  for (
    let attempt = 0;
    attempt < RETRY_SCHEDULED_MAX_ATTEMPTS &&
    data?.status === "retry-scheduled";
    attempt += 1
  ) {
    let statusWaitSeconds = Math.max(1, Number(data?.retryAfterSeconds) || 10);
    if (typeof data?.taskId === "string" && data.taskId) {
      try {
        const statusResponse = await fetch(
          `/api/task/${encodeURIComponent(data.taskId)}`,
          { signal },
        );
        const status = await statusResponse.json();
        if (status?.status === "retry-scheduled") {
          statusWaitSeconds = Math.max(
            1,
            Number(status.retryAfterSeconds) || statusWaitSeconds,
          );
        }
      } catch {
        // Status poll failed: fall back to the worker's own estimate.
      }
    }
    const waitMs = Math.max(
      RETRY_SCHEDULED_MIN_WAIT_MS,
      Math.min(statusWaitSeconds * 1000, RETRY_SCHEDULED_MAX_WAIT_MS),
    );
    await sleepResumable(waitMs, signal);
    response = await fetchHostedResponse(fetchOptions);
    try {
      data = await response.json();
    } catch (err) {
      if (err?.name === "AbortError" || signal?.aborted) throw err;
      data = {};
    }
  }
  if (data?.status === "retry-scheduled") {
    throw new Error(
      "The hosted AI service is temporarily busy and its recovery is still scheduled. Please try again shortly.",
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in.");
    }
    const serverMsg =
      typeof data?.error === "string"
        ? data.error
        : data?.error?.message || data?.message || `HTTP ${response.status}`;
    if (response.status === 402 || data?.code === "plan_limit") {
      throw new Error(
        serverMsg === `HTTP ${response.status}`
          ? "You have used up your plan's monthly allowance. Upgrade in Settings → Billing to keep going."
          : serverMsg,
      );
    }
    const detail =
      typeof data?.detail === "string" && data.detail.trim()
        ? ` (${data.detail.trim()})`
        : "";
    throw new Error(`Hosted AI request failed: ${serverMsg}${detail}`);
  }

  const strippedContent = stripThinkingBlocks(
    typeof data?.content === "string" ? data.content : "",
  );
  const rawContent = strippedContent || null;

  if (!rawContent) {
    throw new Error("Hosted AI returned only reasoning and no answer.");
  }

  if (data?.projectState && typeof data.projectState === "object") {
    onProjectState(data.projectState);
  }

  const initialEval = evaluateResponse(rawContent, contract, fineIntent);
  let finalContent = rawContent;
  let repaired = false;

  if (!initialEval.isCompliant) {
    const repairResult = repairResponse(
      rawContent,
      initialEval,
      contract,
      Number.MAX_SAFE_INTEGER,
      0,
      fineIntent,
    );
    finalContent = repairResult.finalContent;
    repaired = repairResult.repaired;
  }

  recordQualitySignal({
    intentType: fineIntent?.primaryIntent || fineIntent?.type,
    confidence: fineIntent?.confidence || 0,
    selectedSkillsCount: resolvedSkillsCount,
    isCompliant: initialEval.isCompliant,
    violationsCount: initialEval.violations.length,
    repaired,
  });

  return finalContent;
}
