import { ContextEngine } from '../context/index.js';
import { PermissionManager } from '../permissions/index.js';
import { ToolRegistry } from '../tools/index.js';
import { ModelProviderRouter } from '../providers/index.js';
import { loadCorezConfig } from '../config/index.js';

export class AgentRuntime {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.config = options.config || loadCorezConfig(this.cwd);
    this.contextEngine = options.contextEngine || new ContextEngine(this.cwd);
    this.permissionManager = options.permissionManager || new PermissionManager(this.config.permissions);
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.providerRouter = options.providerRouter || new ModelProviderRouter();
  }

  async runTask(userPrompt, options = {}) {
    const signal = options.signal;
    const onStatus = options.onStatus || (() => {});
    const model = options.model || this.config.model;

    // 1. Inspect project and load instructions
    onStatus({ type: 'status', message: 'Inspecting workspace context...' });
    this.contextEngine.inspectProject();
    this.contextEngine.loadInstructions();

    const systemPrompt = `You are CoreZ AI Agent, an autonomous software engineering assistant operating on the user's repository.
Your goal is to complete the user's request accurately using local workspace tools.

Guidelines:
1. First inspect relevant files and directories to understand the codebase.
2. Formulate a step-by-step plan before making edits.
3. Use tool calls to read files, run tests, write code, or check git status.
4. Verify your work using automated tests or linter when appropriate.
5. Provide a concise, clear final summary when done.

${this.contextEngine.buildSystemContextPrompt()}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let currentStep = 0;
    const stepsHistory = [];
    let blocked = false;
    let blockedReason = '';
    let previousEvidence = null;
    let previousAssistantContent = null;
    let noProgressStreak = 0;

    // No fixed step cap: the task runs until the completion gate passes, the
    // user cancels, or the runtime proves no further progress is possible.
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

      stepsHistory.push({
        step: currentStep,
        content,
        toolCallsCount: toolCalls.length
      });

      messages.push({
        role: 'assistant',
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      });

      // Completion gate: the model produced a final answer without further
      // tool calls. It must be new evidence: a no-tool reply that merely
      // repeats the previous assistant message is a stall, not a finish.
      if (toolCalls.length === 0) {
        if (content.trim() !== '' && content.trim() === previousAssistantContent) {
          blocked = true;
          blockedReason = 'The model repeated the same no-tool reply without new evidence.';
          onStatus({ type: 'blocked', message: blockedReason });
          break;
        }
        onStatus({ type: 'complete', message: 'Task completed cleanly.' });
        break;
      }
      previousAssistantContent = content;

      // Execute each tool call emitted by model
      const stepResults = [];
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
          autoApprove: options.autoApprove === true
        });

        onStatus({ type: 'tool_end', name: fnName, result });

        stepResults.push(JSON.stringify(result));
        messages.push({
          role: 'tool',
          tool_call_id: call.id || `tool_${Date.now()}`,
          content: JSON.stringify(result)
        });
      }

      // Progress guard: identical tool results across consecutive steps mean
      // the loop is repeating the same action without new evidence. Stop
      // once that has been proven three times in a row.
      const evidence = stepResults.join('|');
      if (evidence !== '' && evidence === previousEvidence) {
        noProgressStreak += 1;
        if (noProgressStreak >= 3) {
          blocked = true;
          blockedReason = 'Three consecutive steps repeated the same tool results without new evidence.';
          onStatus({ type: 'blocked', message: blockedReason });
          break;
        }
      } else {
        noProgressStreak = 0;
      }
      previousEvidence = evidence;
    }

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')?.content || 'Task finished.';

    return {
      success: !blocked,
      truncated: false,
      blocked,
      blockedReason,
      response: lastAssistantMessage,
      stepsCount: currentStep,
      stepsHistory,
      inspectedFiles: Array.from(this.contextEngine.inspectedFiles),
      modifiedFiles: Array.from(this.contextEngine.modifiedFiles),
      executedToolsCount: this.contextEngine.executedTools.length
    };
  }
}
