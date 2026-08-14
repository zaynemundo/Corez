// McpToolBridge: Connects an McpClient to CoreZ ToolRegistry.
// Discovers remote MCP tools and registers them as first-class tools in CoreZ.

import { PERMISSION_CATEGORIES } from '../../permissions/index.js';

export class McpToolBridge {
  constructor(options = {}) {
    this.serverName = options.serverName || 'mcp';
    this.prefix = options.prefix ?? `mcp__${this.serverName}__`;
    this.category = options.category || PERMISSION_CATEGORIES.EXECUTE;
  }

  /**
   * Mounts all tools from an McpClient instance into a ToolRegistry.
   * @param {object} toolRegistry - CoreZ ToolRegistry
   * @param {object} mcpClient - McpClient instance
   * @returns {Promise<Array<string>>} List of registered tool names
   */
  async mount(toolRegistry, mcpClient) {
    if (!mcpClient.connected) {
      await mcpClient.connect();
    }

    const tools = await mcpClient.listTools();
    const registeredNames = [];

    for (const tool of tools) {
      const toolName = `${this.prefix}${tool.name}`;
      const schema = {
        type: 'object',
        properties: tool.inputSchema?.properties || {},
        required: tool.inputSchema?.required || []
      };

      toolRegistry.registerTool({
        name: toolName,
        category: this.category,
        description: `[MCP: ${this.serverName}] ${tool.description || tool.name}`,
        parameters: schema,
        execute: async (args) => {
          try {
            const callResult = await mcpClient.callTool(tool.name, args);
            if (callResult?.isError) {
              const errMsg = callResult.content?.map(c => c.text || '').join('\n') || 'MCP tool reported an error.';
              return { success: false, error: errMsg };
            }
            // Format MCP content parts
            if (Array.isArray(callResult?.content)) {
              const textContent = callResult.content
                .map(c => (c.type === 'text' ? c.text : JSON.stringify(c)))
                .join('\n');
              return { success: true, content: textContent, rawContent: callResult.content };
            }
            return { success: true, result: callResult };
          } catch (err) {
            return { success: false, error: err.message || 'MCP tool execution failed.' };
          }
        }
      });

      registeredNames.push(toolName);
    }

    return registeredNames;
  }
}
