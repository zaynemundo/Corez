import { ContextEngine } from '../context/index.js';
import { PermissionManager } from '../permissions/index.js';
import { ToolRegistry } from '../tools/index.js';
import { ModelProviderRouter } from '../providers/index.js';
import { loadCorezConfig } from '../config/index.js';
import { createGateState, recordToolExecution, evaluateCompletionGate } from './gate.js';
import { ProgressTracker } from './progress.js';

export class AgentRuntime {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.config = options.config || loadCorezConfig(this.cwd);
    this.contextEngine = options.contextEngine || new ContextEngine(this.cwd);
    this.permissionManager = options.permissionManager || new PermissionManager(this.config.permissions);
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.providerRouter = options.providerRouter || new ModelProviderRouter();
    // 'repository' (default): tasks must pass the evidence-backed
    // completion gate before they may complete. 'conversational': a
    // no-tool response completes normally.
    this.executionMode = options.mode || 'repository';
  }

  async runTask(userPrompt, options = {}) {
    const signal = options.signal;
    const onStatus = options.onStatus || (() => {});
    const model = options.model || this.config.model;
    const mode = options.mode || this.executionMode;
    const gate = createGateState();
    const tracker = new ProgressTracker();

    // 1. Inspect project and load instructions (gate evidence #1)
    onStatus({ type: 'status', message: 'Inspecting workspace context...' });
    this.contextEngine.inspectProject();
    this.contextEngine.loadInstructions();
    recordToolExecution(gate, 'load_instructions', {}, { success: true });
    if (this.contextEngine.instructions && this.contextEngine.instructions.length > 0) {
      for (const inst of this.contextEngine.instructions) {
        tracker.inspectedFiles.add(inst.filename);
      }
    }

    const availableScripts = this.contextEngine.projectInfo?.scripts || {};
    const isRepositoryMode = mode === 'repository';

    const systemPrompt = isRepositoryMode
      ? `You are CoreZ AI Agent, an autonomous software engineering assistant operating on the user's repository.
Your goal is to complete the user's request accurately using local workspace tools.

Mandatory repository workflow — do not skip steps:
1. Load repository instructions (already provided below).
2. Inspect git status and identify the relevant files; READ every file before modifying it.
3. Create a task plan with \`create_plan\` and mark items done with \`update_plan_item\` as you complete them.
4. Implement the changes with \`write_file\` / \`edit_file\`.
5. Verify: run targeted tests (\`run_tests\`), lint (\`run_lint\`), build (\`run_build\`), and \`git_diff_check\`.
6. Inspect the final \`git_diff\` AFTER your last change.
7. Call \`finalize_task\` with structured completion evidence: \`constraints\` (each verified, with a non-empty verificationMethod and evidence) and \`reviewFindings\` (a real review pass; every blocking finding resolved with resolutionEvidence). Boolean flags are not accepted as proof.
8. Only when \`finalize_task\` passes may you give the final summary.

You MUST NOT finish the task merely by answering without tool calls: an unfinished repository operation continues with the next required action.

${this.contextEngine.buildSystemContextPrompt()}`

      : `You are CoreZ AI Agent, a helpful assistant. Answer the user directly and concisely. Use tools only if genuinely required.
${this.contextEngine.buildSystemContextPrompt()}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let currentStep = 0;
    const stepsHistory = [];
    let blocked = false;
    let blockedReason = '';
    let gatePassed = false;
    let previousStepSnapshot = null;
    let previousActionKeys = null;
    let previousAssistantContent = null;
    let finalSummaryContent = null;

    // After the completion gate passes, the runtime performs ONE additional
    // provider call with tools disabled: the model turns the verified
    // evidence into the final user-facing summary. If that call fails, the
    // last assistant message is used as a fallback (the task never crashes).
    const performFinalSummary = async (stepNumber) => {
      const evidence = {
        goal: userPrompt,
        plan: Array.from(gate.planItems.entries()).map(([id, item]) => ({
          id,
          description: item.description,
          status: item.status
        })),
        changedFiles: Array.from((gate.fileLifecycles || new Map()).entries())
          .filter(([, lifecycle]) => lifecycle.lastSuccessfulWriteAt !== null)
          .map(([filePath]) => filePath),
        tests: gate.toolExecutions.get('run_tests') ?? null,
        lint: gate.toolExecutions.get('run_lint') ?? null,
        build: gate.toolExecutions.get('run_build') ?? null,
        diffCheck: gate.toolExecutions.get('git_diff_check') ?? null,
        constraintEvidence: gate.constraintEvidence ?? [],
        reviewResults: gate.reviewResults ?? [],
        remainingRisks: (gate.reviewResults ?? [])
          .filter((finding) => !((finding?.severity || 'blocking') === 'blocking' && finding?.status === 'resolved'))
          .map((finding) => ({
            findingId: finding?.findingId,
            severity: finding?.severity,
            description: finding?.description
          }))
      };
      messages.push({
        role: 'user',
        content: `[FINAL RESPONSE REQUIRED] The completion gate has passed. Produce the final user response with exactly these sections: "Completed", "Changed", "Verified", "Preserved", "Remaining". Do not include hidden chain-of-thought. Verified evidence:\n${JSON.stringify(evidence, null, 2)}`
      });
      let content;
      try {
        const aiResponse = await this.providerRouter.generate({
          model,
          messages,
          tools: [],
          reasoning: this.config.reasoning,
          signal
        });
        content = (aiResponse && aiResponse.content) || '';
      } catch (err) {
        if (err.name === 'AbortError' || signal?.aborted) {
          throw new Error('Task execution cancelled by user (SIGINT).', { cause: err });
        }
        // Provider failure on the final call: fall back to the last
        // assistant message below instead of crashing the task.
        content = null;
      }
      if (content !== null) {
        messages.push({ role: 'assistant', content });
        stepsHistory.push({ step: stepNumber, content, toolCallsCount: 0 });
      }
      return content;
    };

    // No fixed step cap: the task runs until the completion gate passes, the
    // user cancels, a permanent blocker is proven, or all providers fail.
    while (true) {
      if (signal?.aborted) {
        throw new Error('Task execution cancelled by user (SIGINT).');
      }

      currentStep++;
      onStatus({ type: 'step', step: currentStep, message: `Reasoning (step ${currentStep})...` });

      const toolSchemas = this.toolRegistry.getToolSchemas();

      let aiResponse;
      try {
        aiResponse = await this.providerRouter.generate({
          model,
          messages,
          tools: toolSchemas,
          reasoning: this.config.reasoning,
          signal
        });
      } catch (err) {
        if (err.name === 'AbortError' || signal?.aborted) {
          throw new Error('Task execution cancelled by user (SIGINT).', { cause: err });
        }
        throw err;
      }

      const content = aiResponse.content || '';
      const toolCalls = aiResponse.toolCalls || [];

      stepsHistory.push({ step: currentStep, content, toolCallsCount: toolCalls.length });
      messages.push({
        role: 'assistant',
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      });

      // ---- Completion decision ------------------------------------------
      if (toolCalls.length === 0) {
        if (!isRepositoryMode) {
          // Conversational mode: a no-tool answer completes normally.
          onStatus({ type: 'complete', message: 'Task completed cleanly.' });
          break;
        }
        // Repository mode: completion requires the evidence-backed gate.
        if (gate.finalizePassed) {
          currentStep++;
          onStatus({ type: 'step', step: currentStep, message: 'Generating the final summary...' });
          finalSummaryContent = await performFinalSummary(currentStep);
          onStatus({ type: 'complete', message: 'Task completed (completion gate passed).' });
          gatePassed = true;
          break;
        }
        // A repeated identical no-tool reply produces no new evidence while
        // the gate is still pending: a deterministic stall, recorded with
        // evidence, not a premature completion.
        if (content.trim() !== '' && content.trim() === previousAssistantContent) {
          blocked = true;
          blockedReason = 'The model repeated the same no-tool reply without new evidence while the completion gate is still pending.';
          onStatus({ type: 'blocked', message: blockedReason });
          break;
        }
        previousAssistantContent = content;
        // The model tried to finish without the gate: inject a continuation
        // instruction naming the next missing action.
        const gateEval = evaluateCompletionGate(gate, {
          availableScripts,
          constraints: [],
          reviewFindings: []
        });
        const next = gateEval.missing[0] || 'call finalize_task with the completion evidence';
        onStatus({ type: 'continuation', message: `Repository task unfinished. Next action: ${next}` });
        messages.push({
          role: 'user',
          content: `[CONTINUATION] The repository task is not complete. Next required action: ${next}. Perform it now using the appropriate tool, then continue until \`finalize_task\` passes.`
        });
        continue;
      }

      // ---- Execute each tool call ----------------------------------------
      const stepResultKeys = [];
      for (const call of toolCalls) {
        if (signal?.aborted) {
          throw new Error('Task execution cancelled by user (SIGINT).');
        }

        const fnName = call.function?.name;
        let fnArgs;
        try {
          fnArgs = typeof call.function?.arguments === 'string'
            ? JSON.parse(call.function.arguments)
            : call.function?.arguments || {};
        } catch (_e) {
          fnArgs = {};
        }

        onStatus({ type: 'tool_start', name: fnName, args: fnArgs });

        const result = await this.toolRegistry.executeTool(fnName, fnArgs, {
          context: this.contextEngine,
          permissionManager: this.permissionManager,
          gate,
          scripts: availableScripts,
          autoApprove: options.autoApprove === true
        });

        onStatus({ type: 'tool_end', name: fnName, result });
        recordToolExecution(gate, fnName, fnArgs, result, this.cwd);
        tracker.applyToolResult(fnName, fnArgs, result);

        if (fnName === 'finalize_task' && result?.success === true) {
          gatePassed = true;
        }

        stepResultKeys.push(fnName);
        messages.push({
          role: 'tool',
          tool_call_id: call.id || `tool_${Date.now()}`,
          content: JSON.stringify(result)
        });
      }

      // The completion gate passed: the task's evidence is complete. Do NOT
      // break immediately — perform ONE additional provider call with tools
      // disabled so the model produces the final user-facing summary from
      // the verified evidence. The final call is not an implementation step,
      // so it can never trigger a deterministic-stall blocker.
      if (gatePassed) {
        currentStep++;
        onStatus({ type: 'step', step: currentStep, message: 'Generating the final summary...' });
        finalSummaryContent = await performFinalSummary(currentStep);
        onStatus({ type: 'complete', message: 'Task completed (completion gate passed).' });
        break;
      }

      // ---- Semantic progress / blocker detection --------------------------
      // A blocker exists only when: the attempted action is deterministic,
      // its inputs/environment are unchanged, its result is unchanged, no
      // semantic dimension moved, and no alternative evidence source is
      // pending. Repeated identical polling is valid while an operation is
      // still pending (ProgressTracker.pendingOperations).
      const snapshot = tracker.snapshot();
      const noSemanticChange = snapshot === previousStepSnapshot;
      const repeatedSameAction = stepResultKeys.length > 0
        && stepResultKeys.join('|') === (previousActionKeys || null);
      if (noSemanticChange && repeatedSameAction && !tracker.hasPendingOperations()) {
        // Deterministic stall with zero evidence change and no pending
        // operation: declare the blocker with actionable evidence.
        blocked = true;
        blockedReason = 'The same deterministic action produced an unchanged result with no new evidence and no pending operation. Semantic state: ' + snapshot;
        onStatus({ type: 'blocked', message: blockedReason });
        break;
      }
      previousStepSnapshot = snapshot;
      previousActionKeys = stepResultKeys.join('|');
    }

    const lastAssistantMessage = (finalSummaryContent
      ?? [...messages].reverse().find(m => m.role === 'assistant')?.content)
      || 'Task finished.';

    return {
      success: !blocked,
      truncated: false,
      blocked,
      blockedReason,
      gatePassed,
      response: lastAssistantMessage,
      stepsCount: currentStep,
      stepsHistory,
      inspectedFiles: Array.from(this.contextEngine.inspectedFiles),
      modifiedFiles: Array.from(this.contextEngine.modifiedFiles),
      executedToolsCount: this.contextEngine.executedTools.length
    };
  }
}
