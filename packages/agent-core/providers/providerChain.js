// Unified CoreZ provider chain.
//
// Preferred order: OpenCode Go -> Official DeepSeek -> OpenRouter.
//
// Behavior contract:
// - One provider interface: generate({ taskId, model, messages, tools, signal }).
// - Structured results: { status: completed|retry-scheduled|cancelled|failed,
//   content, toolCalls, provider, model, taskId, retryAfterSeconds, error }.
// - Transient preferred-provider failure falls back to the next provider
//   immediately and persists a retry schedule so the task can resume.
// - Permanent failures (401/400/...) are never retried.
// - Transient failures are retried with exponential backoff + jitter and
//   Retry-After is honored. There is no fixed attempt count: schedules grow
//   until recovery or an operator hang guard.
// - Cancellation (AbortSignal) stops generation and backoff waits.
// - A failure to persist a retry schedule never claims resumability.

import {
  OpenCodeGoAdapter,
  DeepSeekAdapter,
  OpenRouterAdapter,
  classifyProviderFailure,
  computeBackoffMs,
  safeDetail
} from './adapters.js';

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDefaultAdapters(options = {}) {
  return [
    new OpenCodeGoAdapter(options),
    new DeepSeekAdapter(options),
    new OpenRouterAdapter(options)
  ];
}

export class ProviderChain {
  constructor(options = {}) {
    this.adapters = Array.isArray(options.adapters) ? options.adapters : buildDefaultAdapters(options);
    this.retryScheduler = options.retryScheduler || null;
    this.onEvent = options.onEvent || (() => {});
    // Operator hang guard: how long a stateless request may keep waiting on
    // backoff before giving up. This bounds *waiting*, never the number of
    // attempts, steps, tool calls or output tokens.
    this.waitBudgetMs = options.waitBudgetMs
      ?? readPositiveNumber(process.env.COREZ_PROVIDER_WAIT_BUDGET_MS, 15_000);
    // Operator-configured backoff base; Retry-After always wins over it.
    this.baseBackoffMs = options.baseBackoffMs ?? readPositiveNumber(process.env.COREZ_BACKOFF_BASE_MS, 1000);
  }

  getConfiguredAdapters() {
    return this.adapters.filter((adapter) => adapter.configured);
  }

  async generate({ taskId = null, model, messages = [], tools = [], signal, persistRetries = true } = {}) {
    if (signal?.aborted) {
      return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
    }

    const eligible = this.getConfiguredAdapters();
    if (eligible.length === 0) {
      return this.result('failed', {
        taskId,
        model,
        error: 'No AI provider is configured. Configure OPENCODE_GO_API_KEY, DEEPSEEK_API_KEY or OPENROUTER_API_KEY to run agent tasks.',
        offline: true
      });
    }

    let retryState = null;
    if (this.retryScheduler?.available && taskId) {
      try {
        retryState = await this.retryScheduler.load(taskId);
      } catch {
        retryState = null;
      }
    }

    const failures = [];

    for (let index = 0; index < eligible.length; index++) {
      if (signal?.aborted) {
        return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
      }

      const adapter = eligible[index];
      const attempt = retryState?.provider === adapter.id ? retryState.attempt : 0;

      if (retryState?.provider === adapter.id && Date.now() < retryState.nextRetryAt) {
        const retryAfterSeconds = Math.max(0, (retryState.nextRetryAt - Date.now()) / 1000);
        if (index === eligible.length - 1) {
          return this.result('retry-scheduled', {
            taskId,
            model,
            provider: adapter.id,
            retryAfterSeconds,
            error: `Provider ${adapter.id} is retry-pending for ${retryAfterSeconds.toFixed(1)}s.`
          });
        }
        continue;
      }

      let result;
      try {
        result = await adapter.generate({ model, messages, tools, signal });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) {
          return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
        }
        result = { ok: false, status: null, detail: err?.message || 'adapter failure' };
      }

      if (result.ok) {
        // Clear the persisted schedule only when the provider that owned it
        // succeeded. A success from a fallback provider keeps the preferred
        // provider's schedule alive so the next turn retries it when due.
        if (this.retryScheduler?.available && taskId && retryState?.provider === adapter.id) {
          try {
            await this.retryScheduler.clear(taskId);
          } catch {
            // Clearing is best-effort; a stale schedule only delays a retry.
          }
        }
        return this.result('completed', {
          taskId,
          content: result.content || '',
          toolCalls: result.toolCalls || [],
          provider: adapter.id,
          model: result.model || model || adapter.defaultModel
        });
      }

      const kind = classifyProviderFailure(result.status);
      failures.push({ provider: adapter.id, status: result.status, detail: result.detail, kind });

      if (kind === 'permanent') {
        if (index === eligible.length - 1) break;
        this.onEvent({ type: 'provider.fallback', from: adapter.id, to: eligible[index + 1].id, taskId });
        continue;
      }

      // Transient failure.
      const persist = Boolean(persistRetries && taskId && this.retryScheduler?.available);
      if (persist) {
        const nextAttempt = attempt + 1;
        const backoffMs = computeBackoffMs({
          attempt: nextAttempt,
          baseMs: this.baseBackoffMs,
          retryAfterSeconds: result.retryAfterSeconds
        });
        const schedule = {
          provider: adapter.id,
          attempt: nextAttempt,
          nextRetryAt: Date.now() + backoffMs,
          lastError: safeDetail(result.detail)
        };
        try {
          await this.retryScheduler.save(taskId, schedule);
          retryState = schedule;
          this.onEvent({
            type: 'provider.retry_scheduled',
            provider: adapter.id,
            retryAfterSeconds: backoffMs / 1000,
            taskId
          });
        } catch {
          return this.result('failed', {
            taskId,
            model,
            provider: adapter.id,
            error: `Provider ${adapter.id} failed (${safeDetail(result.detail) || result.status}) and the retry schedule could not be persisted.`,
            resumable: false
          });
        }

        if (index < eligible.length - 1) {
          this.onEvent({ type: 'provider.fallback', from: adapter.id, to: eligible[index + 1].id, taskId });
          continue;
        }
        return this.result('retry-scheduled', {
          taskId,
          model,
          provider: adapter.id,
          retryAfterSeconds: backoffMs / 1000,
          error: `Provider ${adapter.id} is temporarily unavailable; the retry was scheduled.`
        });
      }

      // Stateless mode: wait in-call with exponential backoff (bounded by the
      // operator hang guard), then fall back to the next provider.
      const deadline = Date.now() + this.waitBudgetMs;
      let backoffAttempt = attempt + 1;
      let nextRetryAfter = result.retryAfterSeconds;
      while (Date.now() < deadline) {
        const waitMs = computeBackoffMs({
          attempt: backoffAttempt,
          baseMs: this.baseBackoffMs,
          retryAfterSeconds: nextRetryAfter
        });
        const remaining = deadline - Date.now();
        if (waitMs >= remaining) break;
        try {
          await abortableSleep(waitMs, signal);
        } catch (err) {
          if (err?.name === 'AbortError' || signal?.aborted) {
            return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
          }
        }
        if (signal?.aborted) {
          return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
        }

        try {
          result = await adapter.generate({ model, messages, tools, signal });
        } catch (err) {
          if (err?.name === 'AbortError' || signal?.aborted) {
            return this.result('cancelled', { taskId, model, error: 'Generation cancelled by the caller.' });
          }
          result = { ok: false, status: null, detail: err?.message || 'adapter failure' };
        }

        if (result.ok) {
          return this.result('completed', {
            taskId,
            content: result.content || '',
            toolCalls: result.toolCalls || [],
            provider: adapter.id,
            model: result.model || model || adapter.defaultModel
          });
        }

        const retryKind = classifyProviderFailure(result.status);
        if (retryKind === 'permanent') {
          break;
        }
        nextRetryAfter = result.retryAfterSeconds ?? nextRetryAfter;
        backoffAttempt += 1;
      }

      if (index < eligible.length - 1) {
        this.onEvent({ type: 'provider.fallback', from: adapter.id, to: eligible[index + 1].id, taskId });
      }
    }

    const lastFailure = failures[failures.length - 1];
    const permanentOnly = failures.every((f) => f.kind === 'permanent');
    const result = this.result('failed', {
      taskId,
      model,
      provider: lastFailure?.provider || null,
      error: permanentOnly
        ? `All configured providers rejected the request permanently. ${formatFailures(failures)}`
        : `All configured providers were unavailable. ${formatFailures(failures)}`
    });
    // Surface the last HTTP status so callers (swarm pools) can detect
    // rate limits and other status-specific retry behaviour.
    result.httpStatus = lastFailure?.status ?? null;
    return result;
  }

  result(status, fields = {}) {
    return {
      status,
      content: fields.content || '',
      toolCalls: fields.toolCalls || [],
      provider: fields.provider || null,
      model: fields.model || null,
      taskId: fields.taskId || null,
      retryAfterSeconds: Number.isFinite(fields.retryAfterSeconds) ? fields.retryAfterSeconds : null,
      error: fields.error || null,
      ...(fields.offline !== undefined ? { offline: fields.offline } : {}),
      ...(fields.resumable !== undefined ? { resumable: fields.resumable } : {})
    };
  }
}

function formatFailures(failures) {
  return failures
    .map((f) => `${f.provider}${f.status ? ` HTTP ${f.status}` : ' (network)'}${f.detail ? `: ${safeDetail(f.detail, 120)}` : ''}`)
    .join(' | ');
}
