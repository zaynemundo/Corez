import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { ApprovalController } from '../permissions/approval-controller.js';
import { PermissionManager } from '../permissions/index.js';
import { WorkspaceSandbox } from '../sandbox/index.js';
import { createCoreTools } from './core-tools.js';

function operationFor(tool, args = {}) {
  return args.command || args.filePath || args.dirPath || args.testFilter || tool.name;
}

function denied(details) {
  return new CorezError(ERROR_CODES.TOOL_DENIED, 'Tool operation was denied.', details);
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    for (const tool of createCoreTools()) this.registerTool(tool);
  }

  registerTool(tool) {
    if (!tool?.name) throw new Error('Tool must have a name.');
    this.tools.set(tool.name, tool);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getAllTools() {
    return [...this.tools.values()];
  }

  getProviderSchemas() {
    return this.getAllTools().map(tool => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters }
    }));
  }

  // Temporary compatibility alias for the unmigrated Task 5 runtime. Remove in Task 5.
  getToolSchemas() {
    return this.getProviderSchemas();
  }

  async executeTool(name, args = {}, executionContext = {}) {
    const tool = this.getTool(name);
    const startedAt = Date.now();
    if (!tool) return { success: false, data: { error: `Unknown tool: ${name}` }, durationMs: 0 };

    const sandbox = executionContext.sandbox || WorkspaceSandbox.create(executionContext.context?.cwd || process.cwd());
    const operation = operationFor(tool, args);
    const permissionManager = executionContext.permissionManager || new PermissionManager();
    const decision = permissionManager.resolve({
      category: tool.category,
      operation,
      autoApprove: executionContext.autoApprove,
      autoEligible: tool.autoEligible,
      contained: Boolean(tool.contained(args, { sandbox }))
    });
    const request = {
      tool: name,
      category: tool.category,
      operation,
      scope: `${tool.category}:${operation}`,
      autoEligible: tool.autoEligible,
      decision
    };

    if (decision.action === 'blocked' || decision.action === 'deny') throw denied({ request });
    if (typeof executionContext.authorize === 'function') {
      const authorization = await executionContext.authorize(request);
      if (!authorization?.allowed) throw denied({ request, authorization });
    } else {
      const controller = executionContext.approvalController || new ApprovalController();
      await controller.authorize(request);
    }

    const execution = await tool.execute(args, { sandbox, signal: executionContext.signal });
    const durationMs = Date.now() - startedAt;
    const output = { ...execution, durationMs };
    if (name === 'embed_text' && execution.success) Object.assign(output, execution.data);

    const context = executionContext.context;
    if (execution.success && context) {
      context.recordToolExecution?.(name, args, output);
      if (['write_file', 'edit_file'].includes(name) && args.filePath) context.recordModifiedFile?.(args.filePath);
      if (['read_file', 'edit_file'].includes(name) && args.filePath) context.recordInspectedFile?.(args.filePath);
    }
    return output;
  }
}
