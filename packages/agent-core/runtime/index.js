import { ContextEngine } from '../context/index.js';
import { PermissionManager } from '../permissions/index.js';
import { ToolRegistry } from '../tools/index.js';
import { ModelProviderRouter } from '../providers/index.js';
import { loadCorezConfig } from '../config/index.js';

// Conversational AgentRuntime.
//
// Repository execution was removed from CoreZ: the public site never runs
// repository work, and the CLI goes through the shared AgentHarness instead.
// This runtime performs a single conversational exchange with the provider —
// no repository tools, no completion gate, no filesystem access. It is kept
// as the CLI's simple chat path with a stable result shape.

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

    onStatus({ type: 'status', message: 'Processing request...' });

    const messages = [
      {
        role: 'system',
        content: 'You are COREZ AI, an AI assistant. Answer the user\'s request directly with text only. You cannot modify files, run commands or access a repository.'
      },
      { role: 'user', content: String(userPrompt || '') }
    ];

    const response = await this.providerRouter.generate({ model, messages, tools: [], signal });
    const content = typeof response?.content === 'string' ? response.content : '';

    return {
      success: true,
      truncated: false,
      blocked: false,
      blockedReason: null,
      status: 'completed',
      response: content,
      stepsCount: 1,
      stepsHistory: [],
      inspectedFiles: [],
      modifiedFiles: [],
      executedToolsCount: 0
    };
  }
}
