import path from 'node:path';
import { ContextEngine } from '../context/index.js';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { createEvent, isCorezEvent } from '../contracts/events.js';
import { PermissionManager, PERMISSION_CATEGORIES } from '../permissions/index.js';
import { ApprovalController } from '../permissions/approval-controller.js';
import { getCommandPolicy } from '../policies/index.js';
import { ModelProviderRouter } from '../providers/index.js';
import { WorkspaceSandbox } from '../sandbox/index.js';
import { ToolRegistry } from '../tools/index.js';
import { loadCorezConfig } from '../config/index.js';
import { DuplicateToolGuard } from './tool-loop.js';

function runtimeError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') {
    if (error?.code === ERROR_CODES.COMMAND_CANCELLED) return error;
    return new CorezError(
      ERROR_CODES.COMMAND_CANCELLED,
      'Command was cancelled.',
      {},
      { cause: error }
    );
  }
  if (error instanceof CorezError) return error;
  return error;
}

function cancellationError() {
  return new CorezError(ERROR_CODES.COMMAND_CANCELLED, 'Command was cancelled.');
}

function stepLimitError(maxSteps) {
  return new CorezError(
    ERROR_CODES.STEP_LIMIT,
    `Agent reached the maximum of ${maxSteps} provider steps without completing.`,
    { maxSteps }
  );
}

function deniedByPolicy(policy, call) {
  return new CorezError(
    ERROR_CODES.TOOL_DENIED,
    `Tool "${call.name}" is not allowed by the ${policy.name} command policy.`,
    { policy: policy.name, tool: call.name }
  );
}

function providerEvent(event) {
  if (!event || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') {
    throw new CorezError(
      ERROR_CODES.PROVIDER_RESPONSE_INVALID,
      'Provider emitted an invalid event.',
      { event }
    );
  }
  if (!['assistant.delta', 'assistant.completed', 'tool.requested'].includes(event.type)) {
    throw new CorezError(
      ERROR_CODES.PROVIDER_RESPONSE_INVALID,
      `Provider emitted unsupported event type: ${event.type}.`,
      { type: event.type }
    );
  }
  return isCorezEvent(event) ? event : createEvent(event.type, event.data);
}

function policyAllows(policy, toolName) {
  return policy.tools.includes('*') || policy.tools.includes(toolName);
}

function providerSchemas(toolRegistry, policy) {
  return toolRegistry.getProviderSchemas().filter(schema => (
    policyAllows(policy, schema.function.name)
  ));
}

function selectProvider(provider, providerRouter, model) {
  if (provider) return provider;
  if (typeof providerRouter?.stream === 'function') return providerRouter;
  if (typeof providerRouter?.createProvider === 'function') {
    return providerRouter.createProvider({ model });
  }
  throw new CorezError(
    ERROR_CODES.PROVIDER_RESPONSE_INVALID,
    'Runtime requires a streaming provider.'
  );
}

function toolCallMessage(call) {
  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: JSON.stringify(call.arguments || {})
    }
  };
}

function errorData(error) {
  return {
    code: error?.code || ERROR_CODES.PROVIDER_RESPONSE_INVALID,
    message: error?.message || String(error),
    details: error?.details || {}
  };
}

function approvalTransaction(controller) {
  if (!(controller?.sessionApprovals instanceof Set)) {
    return {
      authorize: request => controller.authorize(request),
      commit: () => {}
    };
  }

  const originalApprovals = controller.sessionApprovals;
  const baselineApprovals = new Set(originalApprovals);
  const isolatedController = Object.create(controller);
  isolatedController.sessionApprovals = new Set(baselineApprovals);
  if (typeof controller.prompt === 'function') {
    isolatedController.prompt = (...args) => controller.prompt(...args);
  }

  return {
    authorize: request => controller.authorize.call(isolatedController, request),
    commit: () => {
      for (const scope of isolatedController.sessionApprovals) {
        if (!baselineApprovals.has(scope)) originalApprovals.add(scope);
      }
    }
  };
}

function authorizeWithSignal(controller, request, signal) {
  return new Promise((resolve, reject) => {
    const transaction = approvalTransaction(controller);
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => {
      finish(reject, cancellationError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    let authorization;
    try {
      authorization = transaction.authorize(request);
    } catch (error) {
      finish(reject, error);
      return;
    }

    Promise.resolve(authorization).then(
      result => {
        if (settled) return;
        if (signal?.aborted) {
          onAbort();
          return;
        }
        transaction.commit();
        finish(resolve, result);
      },
      error => finish(reject, error)
    );
  });
}

function runContext(contextEngine, cwd) {
  const inspectedFiles = new Set();
  const modifiedFiles = new Set();
  const normalizeFile = filePath => (
    path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath
  );
  const context = Object.create(contextEngine);

  context.recordInspectedFile = filePath => {
    if (!filePath) return;
    inspectedFiles.add(normalizeFile(filePath));
    contextEngine.recordInspectedFile?.(filePath);
  };
  context.recordModifiedFile = filePath => {
    if (!filePath) return;
    modifiedFiles.add(normalizeFile(filePath));
    contextEngine.recordModifiedFile?.(filePath);
  };
  context.recordToolExecution = (...args) => {
    contextEngine.recordToolExecution?.(...args);
  };

  return { context, inspectedFiles, modifiedFiles };
}

async function* streamToolExecution(start, state) {
  const queuedEvents = [];
  let wake;
  let settled = false;
  let executionError;
  let executionResult;
  let cancelled = false;

  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const waitUntilObserved = event => new Promise(resolve => {
    queuedEvents.push({ event, observed: resolve });
    notify();
  });
  const authorize = async (controller, request) => {
    await waitUntilObserved(createEvent('approval.requested', { request }));
    if (cancelled || state.signal?.aborted) throw cancellationError();
    let resolutionEmitted = false;
    try {
      const authorization = await authorizeWithSignal(controller, request, state.signal);
      resolutionEmitted = true;
      await waitUntilObserved(createEvent('approval.resolved', {
        request,
        authorization
      }));
      if (cancelled || state.signal?.aborted) throw cancellationError();
      return authorization;
    } catch (error) {
      if (!cancelled
        && !resolutionEmitted
        && error?.code !== ERROR_CODES.COMMAND_CANCELLED) {
        await waitUntilObserved(createEvent('approval.resolved', {
          request,
          authorization: {
            allowed: false,
            code: error?.code
          }
        }));
      }
      throw error;
    }
  };

  Promise.resolve()
    .then(() => start(request => authorize(state.approvalController, request)))
    .then(
      result => {
        executionResult = result;
        settled = true;
        notify();
      },
      error => {
        executionError = error;
        settled = true;
        notify();
      }
    );

  try {
    while (!settled || queuedEvents.length > 0) {
      if (queuedEvents.length > 0) {
        const pending = queuedEvents.shift();
        yield pending.event;
        pending.observed();
        continue;
      }
      await new Promise(resolve => {
        wake = resolve;
        if (settled || queuedEvents.length > 0) notify();
      });
    }
    if (executionError) throw executionError;
    state.result = executionResult;
  } finally {
    cancelled = true;
    for (const pending of queuedEvents) pending.observed();
    notify();
  }
}

function systemPrompt(contextEngine) {
  return `You are CoreZ AI Agent, an autonomous software engineering assistant operating on the user's repository.
Your goal is to complete the user's request accurately using local workspace tools.

Guidelines:
1. First inspect relevant files and directories to understand the codebase.
2. Formulate a step-by-step plan before making edits.
3. Use tool calls to read files, run tests, write code, or check git status.
4. Verify your work using automated tests or a linter when appropriate.
5. Provide a concise final summary when done.

${contextEngine.buildSystemContextPrompt()}`;
}

export class AgentRuntime {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.config = options.config || loadCorezConfig(this.cwd);
    this.contextEngine = options.contextEngine || new ContextEngine(this.cwd);
    this.permissionManager = options.permissionManager || new PermissionManager(this.config.permissions);
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.providerRouter = options.providerRouter || new ModelProviderRouter();
    this.provider = options.provider;
    this.sandbox = options.sandbox || WorkspaceSandbox.create(this.cwd);
    this.approvalController = options.approvalController || new ApprovalController();
    this.maxSteps = options.maxSteps ?? 25;
    this.duplicateToolLimit = options.duplicateToolLimit ?? 3;
    this.modelOverride = options.modelOverride;
  }

  static createForWorkspace(cwd, options = {}) {
    return new AgentRuntime({ ...options, cwd });
  }

  async *runTask(userPrompt, options = {}) {
    const signal = options.signal;
    const policy = typeof options.policy === 'string'
      ? getCommandPolicy(options.policy)
      : options.policy || getCommandPolicy('run');
    const model = options.model || this.modelOverride || this.config.model;
    const maxSteps = options.maxSteps ?? this.maxSteps;
    const duplicateGuard = new DuplicateToolGuard(
      options.duplicateToolLimit ?? this.duplicateToolLimit
    );
    let stepsCount = 0;
    let executedToolsCount = 0;

    try {
      yield createEvent('run.started', {
        prompt: userPrompt,
        policy: policy.name,
        model,
        maxSteps
      });
      if (signal?.aborted) throw cancellationError();

      this.contextEngine.inspectProject();
      this.contextEngine.loadInstructions();
      const currentRun = runContext(this.contextEngine, this.cwd);
      const messages = [
        { role: 'system', content: systemPrompt(this.contextEngine) },
        { role: 'user', content: userPrompt }
      ];
      const provider = selectProvider(this.provider, this.providerRouter, model);
      const tools = providerSchemas(this.toolRegistry, policy);

      while (stepsCount < maxSteps) {
        if (signal?.aborted) throw cancellationError();
        stepsCount += 1;
        yield createEvent('status', {
          step: stepsCount,
          maxSteps,
          message: `Reasoning step ${stepsCount} of ${maxSteps}.`
        });

        const assistantText = [];
        const toolCalls = [];
        let assistantCompleted = false;

        try {
          for await (const rawEvent of provider.stream({
            model,
            messages,
            tools,
            reasoning: this.config.reasoning,
            signal
          })) {
            if (signal?.aborted) throw cancellationError();
            const event = providerEvent(rawEvent);
            if (event.type === 'assistant.delta') assistantText.push(event.data.text || '');
            if (event.type === 'assistant.completed') assistantCompleted = true;
            if (event.type === 'tool.requested') toolCalls.push(event.data);
            yield event;
          }
        } catch (error) {
          throw runtimeError(error, signal);
        }

        if (toolCalls.length === 0) {
          if (!assistantCompleted) {
            throw new CorezError(
              ERROR_CODES.PROVIDER_RESPONSE_INVALID,
              'Provider turn ended without a tool request or assistant completion.'
            );
          }
          const completed = {
            success: true,
            stepsCount,
            inspectedFiles: [...currentRun.inspectedFiles],
            modifiedFiles: [...currentRun.modifiedFiles],
            executedToolsCount
          };
          yield createEvent('run.completed', completed);
          return;
        }

        messages.push({
          role: 'assistant',
          content: assistantText.join(''),
          tool_calls: toolCalls.map(toolCallMessage)
        });

        for (const call of toolCalls) {
          if (signal?.aborted) throw cancellationError();
          if (!policyAllows(policy, call.name)) throw deniedByPolicy(policy, call);
          duplicateGuard.observe(call);

          const executionState = {
            approvalController: this.approvalController,
            signal
          };
          for await (const approvalEvent of streamToolExecution(authorize => (
            this.toolRegistry.executeTool(call.name, call.arguments || {}, {
              sandbox: this.sandbox,
              context: currentRun.context,
              permissionManager: this.permissionManager,
              approvalController: this.approvalController,
              autoApprove: options.autoApprove,
              signal,
              authorize
            })
          ), executionState)) yield approvalEvent;
          const result = executionState.result;

          executedToolsCount += 1;
          yield createEvent('tool.completed', {
            id: call.id,
            name: call.name,
            result
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result)
          });

          const tool = this.toolRegistry.getTool(call.name);
          if (result?.success && tool?.category === PERMISSION_CATEGORIES.WORKSPACE_WRITE) {
            duplicateGuard.reset();
          }
        }
      }

      throw stepLimitError(maxSteps);
    } catch (error) {
      const failure = runtimeError(error, signal);
      yield createEvent('error', errorData(failure));
      throw failure;
    }
  }

  async execute(userPrompt, options = {}) {
    let response = '';
    let completion;

    for await (const event of this.runTask(userPrompt, options)) {
      if (event.type === 'assistant.delta') response += event.data.text || '';
      if (event.type === 'run.completed') completion = event.data;
    }

    if (!completion?.success) {
      throw new CorezError(
        ERROR_CODES.PROVIDER_RESPONSE_INVALID,
        'Agent run ended without a successful completion event.'
      );
    }

    return {
      success: true,
      response,
      stepsCount: completion.stepsCount,
      inspectedFiles: completion.inspectedFiles,
      modifiedFiles: completion.modifiedFiles,
      executedToolsCount: completion.executedToolsCount
    };
  }
}

export { DuplicateToolGuard, toolCallFingerprint } from './tool-loop.js';
