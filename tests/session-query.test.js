import { describe, it, expect } from 'vitest';
import { SessionQueryEngine, createSessionQueryTool } from '../packages/agent-core/session-query/SessionQueryEngine.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { MemoryTaskStore } from '../packages/agent-core/persistence/TaskStore.js';

describe('SessionQueryEngine & session_query Tool', () => {
  it('searches across message history with keyword matching', async () => {
    const engine = new SessionQueryEngine();
    const messages = [
      { role: 'user', content: 'Configure Postgres database connection string' },
      { role: 'assistant', content: 'Connection string configured at postgresql://user:pass@localhost:5432/corez_db' },
      { role: 'user', content: 'Now create table users with email and password' },
      { role: 'assistant', content: 'Created users table successfully.' }
    ];

    const result = await engine.query({ messages, query: 'postgresql' });
    expect(result.count).toBe(1);
    expect(result.matches[0].matchSnippet).toContain('postgresql://user:pass');
  });

  it('filters by category such as errors or tools', async () => {
    const store = new MemoryTaskStore();
    await store.createTask({
      taskId: 'task-err-test',
      userId: 'u1',
      prompt: 'run tests',
      status: 'failed'
    });
    await store.updateTask('task-err-test', {
      toolExecutions: [
        { toolName: 'exec_command', args: { command: 'npm test' }, result: { error: 'Test timeout in auth.test.js' } },
        { toolName: 'read_file', args: { filePath: 'package.json' }, result: { success: true } }
      ]
    });

    const engine = new SessionQueryEngine({ store });
    const errorResults = await engine.query({ taskId: 'task-err-test', query: 'timeout', filter: 'errors' });

    expect(errorResults.count).toBe(1);
    expect(errorResults.matches[0].toolName).toBe('exec_command');
    expect(errorResults.matches[0].matchSnippet).toContain('Test timeout');
  });

  it('executes session_query tool via ToolRegistry cleanly', async () => {
    const engine = new SessionQueryEngine();
    const tool = createSessionQueryTool(engine);
    const registry = new ToolRegistry();
    registry.registerTool(tool);

    const context = {
      messages: [
        { role: 'user', content: 'What is the JWT secret key name?' },
        { role: 'assistant', content: 'The key is stored in JWT_SIGNING_SECRET env variable.' }
      ]
    };

    const res = await registry.executeTool('session_query', { query: 'JWT_SIGNING_SECRET' }, { context, autoApprove: true });
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
    expect(res.matches[0].matchSnippet).toContain('JWT_SIGNING_SECRET');
  });
});
