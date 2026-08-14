// SessionQueryEngine: Trajectory and session event search for CoreZ AI.
// Inspired by DeepSeek Harness dsh-session-query / tool-session-query.
// Allows agents to query past actions, decisions, and tool outputs without prompt context bloat.

import { PERMISSION_CATEGORIES } from '../permissions/index.js';

export class SessionQueryEngine {
  constructor(options = {}) {
    this.store = options.store || null;
    this.eventBus = options.eventBus || null;
  }

  /**
   * Queries session events, messages, or task snapshots.
   * @param {object} options
   * @param {string} [options.taskId]
   * @param {string} [options.sessionId]
   * @param {Array} [options.messages]
   * @param {string} options.query - Search keyword or regex
   * @param {string} [options.filter] - 'all' | 'tools' | 'user' | 'assistant' | 'errors'
   * @param {number} [options.limit] - Max results (default 15)
   * @returns {Promise<{ count: number, matches: Array<{ index: number, role?: string, type: string, matchSnippet: string, fullContent?: string, timestamp?: string }> }>}
   */
  async query({ taskId, messages = [], query = '', filter = 'all', limit = 15 } = {}) {
    const rawItems = [];

    // 1. Gather messages from task store if taskId provided
    if (taskId && this.store && typeof this.store.getTask === 'function') {
      try {
        const task = await this.store.getTask(taskId);
        if (Array.isArray(task?.messages)) {
          rawItems.push(...task.messages.map((m, idx) => ({
            index: idx,
            role: m.role,
            type: m.role === 'assistant' ? 'assistant_message' : 'user_message',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            toolCalls: m.tool_calls || null
          })));
        }
        if (Array.isArray(task?.toolExecutions)) {
          rawItems.push(...task.toolExecutions.map((te, idx) => ({
            index: idx,
            type: 'tool_execution',
            toolName: te.toolName || te.name,
            content: `Tool "${te.toolName || te.name}" args: ${JSON.stringify(te.args)} result: ${JSON.stringify(te.result)}`,
            isError: Boolean(te.result?.error || te.error)
          })));
        }
      } catch {
        // fallback to provided messages
      }
    }

    // 2. Add inline messages
    if (rawItems.length === 0 && Array.isArray(messages)) {
      rawItems.push(...messages.map((m, idx) => ({
        index: idx,
        role: m.role,
        type: m.role === 'assistant' ? 'assistant_message' : 'user_message',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        toolCalls: m.tool_calls || null
      })));
    }

    // 3. Apply Filter
    let filtered = rawItems;
    if (filter === 'tools') {
      filtered = rawItems.filter(i => i.type === 'tool_execution' || i.toolCalls);
    } else if (filter === 'user') {
      filtered = rawItems.filter(i => i.role === 'user');
    } else if (filter === 'assistant') {
      filtered = rawItems.filter(i => i.role === 'assistant');
    } else if (filter === 'errors') {
      filtered = rawItems.filter(i => i.isError || /error|failed|exception/i.test(i.content));
    }

    // 4. Search matching items
    const lowerQuery = query.toLowerCase();
    const matches = [];

    for (const item of filtered) {
      if (matches.length >= limit) break;
      const text = item.content || '';
      const matchIndex = text.toLowerCase().indexOf(lowerQuery);

      if (matchIndex !== -1 || !query) {
        // Extract surrounding snippet
        const start = Math.max(0, matchIndex - 60);
        const end = Math.min(text.length, matchIndex + query.length + 100);
        const snippet = (start > 0 ? '...' : '') + text.slice(start, end).trim() + (end < text.length ? '...' : '');

        matches.push({
          index: item.index,
          type: item.type,
          role: item.role || undefined,
          toolName: item.toolName || undefined,
          matchSnippet: snippet,
          fullContent: text.length > 500 ? text.slice(0, 500) + '... [truncated]' : text
        });
      }
    }

    return {
      count: matches.length,
      query,
      filter,
      matches
    };
  }
}

/**
 * Creates the `session_query` tool for CoreZ ToolRegistry.
 */
export function createSessionQueryTool(sessionQueryEngine) {
  return {
    name: 'session_query',
    category: PERMISSION_CATEGORIES.READ,
    description: 'Search historical conversation turns, previous tool execution outputs, or errors from past trajectory without blowing up current model context.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword to look for in past messages and tool outputs'
        },
        filter: {
          type: 'string',
          enum: ['all', 'tools', 'user', 'assistant', 'errors'],
          description: 'Optional filter category'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matches to return (default 10)'
        }
      },
      required: ['query']
    },
    execute: async ({ query, filter = 'all', limit = 10 }, runtimeOptions = {}) => {
      const taskId = runtimeOptions.taskId;
      const messages = runtimeOptions.context?.messages || [];

      try {
        const result = await sessionQueryEngine.query({
          taskId,
          messages,
          query,
          filter,
          limit
        });
        return {
          success: true,
          ...result
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || 'Session query failed.'
        };
      }
    }
  };
}
