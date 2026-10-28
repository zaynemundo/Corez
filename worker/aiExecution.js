import {
  safeErrorDetail,
  jsonResponse,
  createTaskStateStore,
  estimateCostUsd,
} from "./utils.js";
import { runProviderChain, runStreamingChain } from "./providerChain.js";
import { runCreationHarness } from "./harness.js";
import { repairMalformedHtml } from "./htmlRepair.js";
import { withVisibleReasoning } from "./modelRouter.js";
import {
  processResponse,
  detectTruncation,
  stitchContinuationChunk,
  isMetaOnlyReply,
  CONTINUATION_INSTRUCTION,
  ANTI_REPEAT_CONTINUATION_INSTRUCTION,
} from "./responseProcessor.js";
import { deriveProjectState, serializeProjectState } from "./projectState.js";
import { runVerificationWithRepair } from "./skillVerification.js";
import {
  fixCommonJSInHtml,
  patchLocalImageSrc,
  buildLiveDataDiagnostics,
} from "./artifactPostProcess.js";
import { sseHeaders, startSseHeartbeat } from "./aiFastPaths.js";

export async function runHarnessAiExecution({
  body,
  harnessOptions,
  tokenAccount,
  env,
}) {
  if (body.stream === true) {
    // Streaming harness: SSE events (phase/delta/done) keep the client
    // informed while the loop takes as long as it needs.
    const encoder = new TextEncoder();
    const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
    const readable = new ReadableStream({
      async start(controller) {
        const stopHeartbeat = startSseHeartbeat(controller, encoder, env);
        try {
          for await (const event of runCreationHarness(harnessOptions)) {
            // A build is many provider calls: capture the reported usage on
            // the diagnostics event so the token counter reflects it.
            if (event.type === "diagnostics") {
              tokenAccount.record(
                event.diagnostics?.usage?.total ||
                  event.diagnostics?.usage?.initial ||
                  event.diagnostics?.usage,
              );
              await tokenAccount.flush();
            }
            controller.enqueue(encoder.encode(sse(event)));
          }
        } catch (err) {
          const payload = {
            type: "error",
            message: err?.retryable
              ? err.message
              : `Creation harness failed: ${safeErrorDetail(err)}`,
            status: err?.status || 502,
            ...(err?.retryable ? { retryable: true } : {}),
          };
          controller.enqueue(encoder.encode(sse(payload)));
        }
        stopHeartbeat();
        controller.close();
      },
    });
    return new Response(readable, {
      status: 200,
      headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
    });
  }

  // Non-streaming harness: run the ENTIRE build loop (plan -> build ->
  // verify -> repair -> review) inside this request, then answer with the
  // finished artifact in a single JSON body.
  try {
    let content = "";
    let projectState = null;
    let diagnostics = null;
    for await (const event of runCreationHarness(harnessOptions)) {
      if (event.type === "clear") {
        content = "";
      } else if (event.type === "delta" && typeof event.text === "string") {
        content += event.text;
      } else if (event.type === "done") {
        projectState = event.projectState ?? projectState;
      } else if (event.type === "diagnostics") {
        diagnostics = event.diagnostics;
        tokenAccount.record(
          event.diagnostics?.usage?.total ||
            event.diagnostics?.usage?.initial ||
            event.diagnostics?.usage,
        );
        await tokenAccount.flush();
      }
    }
    return jsonResponse(200, { content, projectState, diagnostics });
  } catch (err) {
    if (err?.status === 499) {
      return jsonResponse(499, { error: "AI request cancelled." });
    }
    return jsonResponse(err?.status || 502, {
      error: err?.retryable
        ? err.message
        : `Creation harness failed: ${safeErrorDetail(err)}`,
      ...(err?.retryable ? { retryable: true } : {}),
    });
  }
}

export function runStreamingAiExecution({
  apiMessages,
  prompt,
  activeProject,
  env,
  clientDisconnectSignal,
  retrySleepFor,
  sessionId,
  selectedModel,
  selectedReasoning,
  skills,
  runtimeContext,
  liveDataEvidence,
  liveDataNeed,
  messages,
  tokenAccount,
  requestStartedAt,
}) {
  const chainOptions = {
    env,
    signal: clientDisconnectSignal,
    sleep: retrySleepFor(env),
    sessionId,
    model: selectedModel,
    reasoning: withVisibleReasoning(selectedReasoning.reasoning),
    temperature: selectedReasoning.temperature,
  };
  const encoder = new TextEncoder();
  const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
  const readable = new ReadableStream({
    async start(controller) {
      let collected = "";
      let providerId = null;
      let providerModel = null;
      let inputTokens = null;
      let outputTokens = null;
      const stopHeartbeat = startSseHeartbeat(controller, encoder, env);
      try {
        for await (const event of runStreamingChain(
          apiMessages,
          chainOptions,
        )) {
          if (event.type === "delta") {
            collected += event.text;
            controller.enqueue(encoder.encode(sse(event)));
          } else if (event.type === "thinking") {
            controller.enqueue(encoder.encode(sse(event)));
          } else if (event.type === "meta") {
            providerId = providerId || event.provider || null;
            providerModel = providerModel || event.model || null;
            controller.enqueue(encoder.encode(sse(event)));
          } else if (event.type === "usage") {
            inputTokens = event.inputTokens ?? inputTokens;
            outputTokens = event.outputTokens ?? outputTokens;
          } else if (event.type === "done") {
            providerId = providerId || event.provider || null;
            providerModel = providerModel || event.model || null;

            // Streaming auto-continuation: if output ended mid-generation (token limit, unclosed blocks)
            let continuationCount = 0;
            const MAX_STREAM_CONTINUATIONS = 8;
            let currentStopReason = event.finishReason || null;
            let antiRepeatTried = false;
            while (
              continuationCount < MAX_STREAM_CONTINUATIONS &&
              collected.trim()
            ) {
              const streamTruncation = detectTruncation(collected, {
                stopReason: currentStopReason,
              });
              if (!streamTruncation.truncated) break;
              continuationCount += 1;
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "phase",
                    phase: "continuing",
                    attempt: continuationCount,
                    total: MAX_STREAM_CONTINUATIONS,
                  }),
                ),
              );

              const streamContMessages = [
                ...apiMessages,
                { role: "assistant", content: collected },
                {
                  role: "user",
                  content: antiRepeatTried
                    ? ANTI_REPEAT_CONTINUATION_INSTRUCTION
                    : CONTINUATION_INSTRUCTION,
                },
              ];

              let contChunk = "";
              let nextStopReason = null;
              try {
                for await (const contEvent of runStreamingChain(
                  streamContMessages,
                  chainOptions,
                )) {
                  if (contEvent.type === "delta") {
                    contChunk += contEvent.text;
                  } else if (
                    contEvent.type === "usage" &&
                    contEvent.outputTokens
                  ) {
                    outputTokens =
                      (outputTokens || 0) + contEvent.outputTokens;
                  } else if (contEvent.type === "done") {
                    nextStopReason = contEvent.finishReason || null;
                  }
                }
              } catch {
                break;
              }

              if (!contChunk.trim()) break;
              if (isMetaOnlyReply(contChunk)) break;
              const { stitched, deltaText, restarted } =
                stitchContinuationChunk(collected, contChunk);
              if (deltaText) {
                controller.enqueue(
                  encoder.encode(sse({ type: "delta", text: deltaText })),
                );
              }
              if (restarted || stitched.length <= collected.length) {
                if (!antiRepeatTried) {
                  antiRepeatTried = true;
                  continue;
                }
                break;
              }
              collected = stitched;
              currentStopReason = nextStopReason;
            }

            // Post-stream validation: truncation/language repair.
            const repairUsage = [];
            const repair = await processResponse(apiMessages, collected, {
              userPrompt: prompt,
              project: activeProject,
              stopReason: currentStopReason,
              generate: async (repairMessages) => {
                const repaired = await runProviderChain(repairMessages, {
                  env,
                  signal: clientDisconnectSignal,
                  store: createTaskStateStore(env),
                  sleep: retrySleepFor(env),
                  sessionId,
                  model: selectedModel,
                  reasoning: selectedReasoning.reasoning,
                  temperature: selectedReasoning.temperature,
                });
                if (repaired?.usage) repairUsage.push(repaired.usage);
                return repaired.content ? repaired : null;
              },
              maxRepairs: 4,
            });
            if (
              repair.diagnostics.repaired &&
              repair.diagnostics.repairReasons.length > 0
            ) {
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "validation",
                    action: "repaired",
                    reasons: repair.diagnostics.repairReasons,
                  }),
                ),
              );
              const appended = repair.content.slice(collected.length);
              if (appended) {
                controller.enqueue(
                  encoder.encode(sse({ type: "delta", text: appended })),
                );
              }
              collected = repair.content;
            }

            // Deterministic fix before honest gate: close truncated tags (htmlRepair)
            if (repair.diagnostics.truncationDetected) {
              const repairedStream = repairMalformedHtml(collected);
              if (repairedStream !== collected) {
                const delta = repairedStream.slice(collected.length);
                if (delta) {
                  controller.enqueue(
                    encoder.encode(sse({ type: "delta", text: delta })),
                  );
                }
                collected = repairedStream;
                const re = detectTruncation(collected, {
                  stopReason: currentStopReason,
                });
                if (!re.truncated) {
                  repair.diagnostics.truncationDetected = false;
                  repair.diagnostics.truncationSignals = [];
                }
              }
            }

            // Honest-failure gate: if the answer is STILL cut off after the
            // provider stream, streaming continuations, and every repair
            // round, surface an explicit error instead of a clean "done".
            if (repair.diagnostics.truncationDetected) {
              const signals = (repair.diagnostics.truncationSignals || [])
                .slice(0, 3)
                .join(", ");
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "error",
                    message: signals
                      ? `The AI reply was cut off (${signals}) and could not be completed automatically. Please try again.`
                      : "The AI reply was cut off and could not be completed automatically. Please try again.",
                    status: 502,
                  }),
                ),
              );
              controller.close();
              return;
            }

            // Safety-net: replace local filename image src with attached data URL if model hallucinated
            const verificationRaw = runVerificationWithRepair({
              prompt,
              content: repair.content,
              skills,
              runtimeContext,
              liveDataEvidence,
              searchEvidence: liveDataEvidence,
            });
            const patchedImage = patchLocalImageSrc(verificationRaw.content, [
              ...messages,
              ...apiMessages,
            ]);
            const fixedJs = fixCommonJSInHtml(patchedImage);
            const finalPatched =
              fixedJs !== patchedImage ? fixedJs : patchedImage;
            const verificationContentPatched = finalPatched;
            const verification =
              verificationRaw.content !== verificationContentPatched
                ? { ...verificationRaw, content: verificationContentPatched }
                : verificationRaw;
            const finalContent = verification.content;
            if (finalContent !== collected) {
              const appended = finalContent.slice(collected.length);
              if (appended) {
                controller.enqueue(
                  encoder.encode(sse({ type: "delta", text: appended })),
                );
              }
              collected = finalContent;
            }
            const returnedProject =
              activeProject ||
              deriveProjectState([
                { role: "assistant", content: finalContent },
              ]);
            if (!finalContent.trim()) {
              controller.enqueue(
                encoder.encode(
                  sse({
                    type: "error",
                    message:
                      "The AI provider returned no content for this request after retries. Please try again.",
                    status: 502,
                  }),
                ),
              );
              controller.close();
              return;
            }
            const streamTotalInput = [
              inputTokens,
              ...repairUsage.map((u) => u.inputTokens),
            ]
              .filter((n) => Number.isFinite(n) && n !== null)
              .reduce((a, b) => a + b, 0);
            const streamTotalOutput = [
              outputTokens,
              ...repairUsage.map((u) => u.outputTokens),
            ]
              .filter((n) => Number.isFinite(n) && n !== null)
              .reduce((a, b) => a + b, 0);
            tokenAccount.record({
              inputTokens: streamTotalInput,
              outputTokens: streamTotalOutput,
            });
            await tokenAccount.flush();
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "done",
                  final: true,
                  projectState: serializeProjectState(returnedProject),
                }),
              ),
            );
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "diagnostics",
                  diagnostics: {
                    ...repair.diagnostics,
                    ttftMs: event.ttftMs || 0,
                    totalMs: Date.now() - requestStartedAt,
                    provider: providerId,
                    model: providerModel,
                    inputTokens,
                    outputTokens,
                    verification: {
                      results: verification.results,
                      hardFailures: verification.hardFailures,
                      passed: verification.passed,
                      repairAttempts: verification.repairAttempts,
                      latencyMs: verification.latencyMs,
                    },
                    liveData: buildLiveDataDiagnostics(
                      liveDataEvidence,
                      liveDataNeed,
                      verification,
                    ),
                    usage: {
                      initial: { inputTokens, outputTokens },
                      repairs: repairUsage,
                      total: {
                        inputTokens: streamTotalInput,
                        outputTokens: streamTotalOutput,
                      },
                      estimatedCostUsd: estimateCostUsd(
                        streamTotalInput,
                        streamTotalOutput,
                        env,
                      ),
                    },
                    latency: {
                      routingMs: 0,
                      providerMs: event.totalMs || 0,
                      verificationMs: verification.latencyMs,
                      repairMs: 0,
                      totalMs: Date.now() - requestStartedAt,
                    },
                  },
                }),
              ),
            );
            controller.close();
            return;
          } else if (event.type === "error") {
            controller.enqueue(encoder.encode(sse(event)));
            controller.close();
            return;
          }
        }
        if (!collected.trim()) {
          controller.enqueue(
            encoder.encode(
              sse({
                type: "error",
                message:
                  "The AI provider returned no content for this request after retries. Please try again.",
                status: 502,
              }),
            ),
          );
        } else {
          controller.enqueue(
            encoder.encode(
              sse({ type: "done", final: true, projectState: null }),
            ),
          );
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sse({
              type: "error",
              message: safeErrorDetail(err),
              status: 502,
            }),
          ),
        );
        controller.close();
      } finally {
        stopHeartbeat();
      }
    },
  });
  return new Response(readable, {
    status: 200,
    headers: sseHeaders({ "Access-Control-Allow-Origin": "*" }),
  });
}

export async function runNonStreamingAiExecution({
  apiMessages,
  prompt,
  activeProject,
  env,
  clientDisconnectSignal,
  retrySleepFor,
  sessionId,
  selectedModel,
  selectedReasoning,
  skills,
  runtimeContext,
  liveDataEvidence,
  liveDataNeed,
  messages,
  tokenAccount,
  requestStartedAt,
}) {
  const providerStartedAt = Date.now();
  const result = await runProviderChain(apiMessages, {
    env,
    signal: clientDisconnectSignal,
    store: createTaskStateStore(env),
    sleep: retrySleepFor(env),
    sessionId,
    model: selectedModel,
    reasoning: selectedReasoning.reasoning,
    temperature: selectedReasoning.temperature,
  });
  const providerMs = Date.now() - providerStartedAt;

  if (result.status === "retry-scheduled") {
    return jsonResponse(200, {
      taskId: result.taskId,
      status: "retry-scheduled",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }

  if (result.status === "cancelled") {
    return jsonResponse(499, { error: "AI request cancelled." });
  }

  if (result.content) {
    const repairUsage = [];
    const repairStartedAt = Date.now();
    const processed = await processResponse(apiMessages, result.content, {
      userPrompt: prompt,
      project: activeProject,
      stopReason: result.stopReason || null,
      generate: async (repairMessages) => {
        const repaired = await runProviderChain(repairMessages, {
          env,
          signal: clientDisconnectSignal,
          store: createTaskStateStore(env),
          sleep: retrySleepFor(env),
          sessionId,
          model: selectedModel,
          reasoning: selectedReasoning.reasoning,
          temperature: selectedReasoning.temperature,
        });
        if (repaired?.usage) repairUsage.push(repaired.usage);
        return repaired.content ? repaired : null;
      },
      maxRepairs: 2,
    });
    const repairMs = Date.now() - repairStartedAt;

    if (processed.diagnostics.truncationDetected) {
      const repairedHtml = repairMalformedHtml(processed.content);
      if (repairedHtml !== processed.content) {
        processed.content = repairedHtml;
        const re = detectTruncation(repairedHtml, {
          stopReason: result.stopReason || null,
        });
        if (!re.truncated) {
          processed.diagnostics.truncationDetected = false;
          processed.diagnostics.truncationSignals = [];
        }
      }
    }

    if (processed.diagnostics.truncationDetected) {
      return jsonResponse(502, {
        error:
          "The AI reply was cut off and could not be completed automatically. Please try again.",
        detail:
          (processed.diagnostics.truncationSignals || [])
            .slice(0, 3)
            .join(", ") || undefined,
        diagnostics: processed.diagnostics,
      });
    }

    const verificationRawNonStream = runVerificationWithRepair({
      prompt,
      content: processed.content,
      skills,
      runtimeContext,
      liveDataEvidence,
      searchEvidence: liveDataEvidence,
    });
    const patchedNonStream = patchLocalImageSrc(
      verificationRawNonStream.content,
      [...messages, ...apiMessages],
    );
    const fixedNonStream = fixCommonJSInHtml(patchedNonStream);
    const finalPatchedNonStream =
      fixedNonStream !== patchedNonStream ? fixedNonStream : patchedNonStream;
    const verificationContentPatchedNonStream = finalPatchedNonStream;
    const verification =
      verificationRawNonStream.content !== verificationContentPatchedNonStream
        ? {
            ...verificationRawNonStream,
            content: verificationContentPatchedNonStream,
          }
        : verificationRawNonStream;
    const finalContent = verification.content;
    const initialTokens = {
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
    };
    const totalInput = [
      initialTokens.inputTokens,
      ...repairUsage.map((u) => u.inputTokens),
    ]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);
    const totalOutput = [
      initialTokens.outputTokens,
      ...repairUsage.map((u) => u.outputTokens),
    ]
      .filter((n) => Number.isFinite(n) && n !== null)
      .reduce((acc, n) => acc + n, 0);

    tokenAccount.record({ inputTokens: totalInput, outputTokens: totalOutput });
    await tokenAccount.flush();

    const returnedProject =
      activeProject ||
      deriveProjectState([{ role: "assistant", content: finalContent }]);
    const diagnostics = {
      ...processed.diagnostics,
      ttftMs: Date.now() - requestStartedAt,
      totalMs: Date.now() - requestStartedAt,
      provider: result.provider || null,
      model: result.model || null,
      inputTokens: result.usage?.inputTokens ?? null,
      outputTokens: result.usage?.outputTokens ?? null,
      fallbackUsed: Boolean(result.resumed),
      verification: {
        results: verification.results,
        hardFailures: verification.hardFailures,
        passed: verification.passed,
        repairAttempts: verification.repairAttempts,
        latencyMs: verification.latencyMs,
      },
      liveData: buildLiveDataDiagnostics(
        liveDataEvidence,
        liveDataNeed,
        verification,
      ),
      usage: {
        initial: initialTokens,
        repairs: repairUsage,
        total: {
          inputTokens: totalInput || initialTokens.inputTokens,
          outputTokens: totalOutput || initialTokens.outputTokens,
        },
        estimatedCostUsd: estimateCostUsd(
          totalInput || initialTokens.inputTokens,
          totalOutput || initialTokens.outputTokens,
          env,
        ),
      },
      latency: {
        routingMs: Math.max(0, providerStartedAt - requestStartedAt),
        providerMs,
        verificationMs: verification.latencyMs,
        repairMs,
        totalMs: Date.now() - requestStartedAt,
      },
    };
    return jsonResponse(200, {
      content: finalContent,
      model: result.model,
      provider: result.provider || null,
      projectState: serializeProjectState(returnedProject) || undefined,
      diagnostics,
    });
  }

  console.error(
    JSON.stringify({
      message: "AI generation failed",
      error: result.error || "all providers returned no usable response",
    }),
  );
  return jsonResponse(502, {
    error: "Unable to generate AI response.",
    detail: result.error || "all providers returned no usable response",
  });
}
