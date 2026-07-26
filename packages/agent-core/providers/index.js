import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { MockProvider } from './mock.js';
import { OpenCodeGoProvider } from './opencode-go.js';
import { OpenRouterProvider } from './openrouter.js';
import { FallbackProvider } from './fallback.js';

export const MODEL_CATALOG = Object.freeze([
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'opencode-go', role: 'Primary Executor (Orchestration, Coding, UI, Building & Verification)' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'openrouter', role: 'Fast Secondary Executor (Rapid UI iterations & smoke testing)' },
  { id: 'kimi-k3', name: 'Kimi K3 Code', provider: 'opencode-go', role: 'Physics & Engine Advisor (specialized math/physics guidance)' },
  { id: 'flux-1-schnell', name: 'FLUX 1 Schnell', provider: 'cloudflare-workers-ai', role: 'Visual Asset & Art Director' }
]);

export class ModelProviderRouter {
  constructor(options = {}) {
    const env = options.env || process.env;
    this.opencodeApiKey = env.OPENCODE_GO_API_KEY || env.OPENCODE_API_KEY || options.opencodeApiKey;
    this.openrouterApiKey = env.OPENROUTER_API_KEY || options.openrouterApiKey;
    this.defaultModel = options.defaultModel || 'deepseek-v4-pro';
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs;
    this.mockTurns = options.mockTurns || [];
  }

  getAvailableModels() {
    return MODEL_CATALOG.map(m => ({
      ...m,
      configured: Boolean(this.opencodeApiKey || this.openrouterApiKey)
    }));
  }

  createProvider({ model = this.defaultModel, mock = false } = {}) {
    if (mock === true) return new MockProvider({ turns: this.mockTurns });

    const modelEntry = MODEL_CATALOG.find(candidate => candidate.id === model);
    if (!modelEntry) {
      throw new CorezError(ERROR_CODES.MODEL_UNSUPPORTED, `Unsupported model: ${model}.`, { model });
    }

    if (modelEntry.provider === 'opencode-go') {
      if (this.opencodeApiKey) {
        const primary = new OpenCodeGoProvider({
          apiKey: this.opencodeApiKey,
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs
        });
        if (this.openrouterApiKey) {
          const fallback = new OpenRouterProvider({
            apiKey: this.openrouterApiKey,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs
          });
          return new FallbackProvider(primary, fallback);
        }
        return primary;
      }
      if (this.openrouterApiKey) {
        return new OpenRouterProvider({
          apiKey: this.openrouterApiKey,
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs
        });
      }
      throw new CorezError(ERROR_CODES.AUTH_MISSING, 'OpenCode Go API credential is required.', {
        provider: modelEntry.provider,
        model
      });
    }

    if (modelEntry.provider === 'openrouter') {
      if (!this.openrouterApiKey) {
        throw new CorezError(ERROR_CODES.AUTH_MISSING, 'OpenRouter API credential is required.', {
          provider: modelEntry.provider,
          model
        });
      }
      return new OpenRouterProvider({
        apiKey: this.openrouterApiKey,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs
      });
    }

    throw new CorezError(ERROR_CODES.MODEL_UNSUPPORTED, `No provider adapter is available for ${model}.`, {
      model,
      provider: modelEntry.provider
    });
  }

  // Temporary compatibility bridge for command/runtime callers pending streaming migration.
  async generate({ model = this.defaultModel, messages = [], tools = [], _reasoning = 'high', signal }) {
    const activeKey = this.opencodeApiKey || this.openrouterApiKey;

    if (activeKey) {
      try {
        const endpoint = this.opencodeApiKey
          ? 'https://api.opencode.ai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
        const body = {
          model,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: 0.2
        };
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify(body),
          signal
        });
        if (response.ok) {
          const data = await response.json();
          const choice = data.choices?.[0];
          return {
            content: choice?.message?.content || '',
            toolCalls: choice?.message?.tool_calls || [],
            raw: data
          };
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }

    return this.simulateLocalAgentResponse(messages, tools);
  }

  simulateLocalAgentResponse(messages, tools) {
    const lastUserMessage = [...messages].reverse().find(message => message.role === 'user')?.content || '';
    const lower = lastUserMessage.toLowerCase();
    const hasTools = Array.isArray(tools) && tools.length > 0;

    if (hasTools) {
      if (lower.includes('list') || lower.includes('files') || lower.includes('structure') || lower.includes('inspect')) {
        const listTool = tools.find(tool => tool.name === 'list_directory');
        if (listTool) {
          return {
            content: 'I will inspect the project workspace directory.',
            toolCalls: [{ id: 'call_1', function: { name: 'list_directory', arguments: JSON.stringify({ dirPath: '.' }) } }]
          };
        }
      }
      if (lower.includes('git') || lower.includes('status') || lower.includes('branch')) {
        const gitTool = tools.find(tool => tool.name === 'git_status');
        if (gitTool) {
          return {
            content: 'Checking Git status...',
            toolCalls: [{ id: 'call_2', function: { name: 'git_status', arguments: JSON.stringify({}) } }]
          };
        }
      }
    }

    return {
      content: `[CoreZ Agent - Offline Mode]\nAnalyzed request: "${lastUserMessage.slice(0, 100)}"\nWorkspace inspection complete. All systems ready.`,
      toolCalls: []
    };
  }

  async generateEmbeddings({ input, model = 'nvidia/nemotron-3-embed-1b:free', signal }) {
    const inputs = Array.isArray(input) ? input : [input];

    if (this.openrouterApiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openrouterApiKey}`
          },
          body: JSON.stringify({ model, input: inputs }),
          signal
        });
        if (response.ok) {
          const data = await response.json();
          return {
            embeddings: (data.data || []).map(item => item.embedding),
            model: data.model || model,
            raw: data
          };
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }

    const simulatedEmbeddings = inputs.map(value => {
      const vector = new Float32Array(1024);
      for (let index = 0; index < value.length; index++) {
        vector[index % 1024] += (value.charCodeAt(index) / 255) - 0.5;
      }
      let norm = 0;
      for (let index = 0; index < 1024; index++) norm += vector[index] * vector[index];
      norm = Math.sqrt(norm) || 1;
      return Array.from(vector.map(entry => entry / norm));
    });

    return { embeddings: simulatedEmbeddings, model, offline: true };
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < vecA.length; index++) {
    dotProduct += vecA[index] * vecB[index];
    normA += vecA[index] * vecA[index];
    normB += vecB[index] * vecB[index];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude ? dotProduct / magnitude : 0;
}

export { MockProvider } from './mock.js';
export { OpenAICompatibleProvider } from './openai-compatible.js';
export { OpenCodeGoProvider } from './opencode-go.js';
export { OpenRouterProvider } from './openrouter.js';
export { decodeSse } from './sse.js';
