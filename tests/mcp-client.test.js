import { describe, it, expect } from 'vitest';
import { McpClient } from '../packages/agent-core/tools/mcp/McpClient.js';
import { McpToolBridge } from '../packages/agent-core/tools/mcp/McpToolBridge.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';

describe('MCP (Model Context Protocol) Integration', () => {
  it('connects and negotiates handshake with memory transport', async () => {
    const memoryHandler = async (req) => {
      if (req.method === 'initialize') {
        return {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-mcp-server', version: '1.0.0' }
        };
      }
      if (req.method === 'tools/list') {
        return {
          tools: [
            {
              name: 'fetch_weather',
              description: 'Fetch current weather for city',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city']
              }
            }
          ]
        };
      }
      if (req.method === 'tools/call') {
        return {
          content: [{ type: 'text', text: `Weather in ${req.params.arguments.city}: 72F and Sunny` }],
          isError: false
        };
      }
      throw new Error(`Unhandled method: ${req.method}`);
    };

    const client = new McpClient({
      transport: 'memory',
      inMemoryHandler: memoryHandler
    });

    await client.connect();
    expect(client.connected).toBe(true);
    expect(client.serverInfo.name).toBe('mock-mcp-server');

    const tools = await client.listTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('fetch_weather');

    const callRes = await client.callTool('fetch_weather', { city: 'San Francisco' });
    expect(callRes.content[0].text).toContain('San Francisco');
  });

  it('mounts MCP tools dynamically into CoreZ ToolRegistry via McpToolBridge', async () => {
    const memoryHandler = async (req) => {
      if (req.method === 'initialize') {
        return { capabilities: { tools: {} }, serverInfo: { name: 'db-server' } };
      }
      if (req.method === 'tools/list') {
        return {
          tools: [
            {
              name: 'query_sql',
              description: 'Execute SQL query',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query']
              }
            }
          ]
        };
      }
      if (req.method === 'tools/call') {
        return {
          content: [{ type: 'text', text: JSON.stringify([{ id: 1, name: 'Alice' }]) }]
        };
      }
      return {};
    };

    const client = new McpClient({ transport: 'memory', inMemoryHandler: memoryHandler });
    const registry = new ToolRegistry();
    const bridge = new McpToolBridge({ serverName: 'postgres' });

    const registered = await bridge.mount(registry, client);
    expect(registered).toContain('mcp__postgres__query_sql');

    const tool = registry.getTool('mcp__postgres__query_sql');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('[MCP: postgres]');

    const execResult = await registry.executeTool('mcp__postgres__query_sql', { query: 'SELECT * FROM users' }, { autoApprove: true });
    expect(execResult.success).toBe(true);
    expect(execResult.content).toContain('Alice');
  });
});
