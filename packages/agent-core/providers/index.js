import {
  OPENCODE_SESSION_HEADER,
  newOpencodeSessionId,
} from './session.js';
import { resolveApiMode } from './endpoint.js';
import { extractContentText, stripThinkingBlocks } from './text.js';
import { PROVIDER_ENDPOINTS, PROVIDER_IDS } from './adapters.js';

export const MODEL_CATALOG = Object.freeze([
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', provider: 'opencode-go', role: 'Primary Executor (Orchestration, Coding, UI, Building & Verification)' },
  { id: 'kimi-k3', name: 'Kimi K3 Code', provider: 'opencode-go', role: 'Physics & Engine Advisor (specialized math/physics guidance)' },
  { id: 'flux-1-schnell', name: 'FLUX 1 Schnell', provider: 'cloudflare-workers-ai', role: 'Visual Asset & Art Director' }
]);

// Pull the assistant text out of either gateway response shape (chat
// completions `choices[].message.content` or responses `output[]`).
function extractAssistantText(data) {
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.output)) {
    const messageItem = data.output.find(
      (item) => item && item.type === 'message' && item.role === 'assistant',
    );
    const textPart =
      messageItem && Array.isArray(messageItem.content)
        ? messageItem.content.find(
            (c) => c && c.type === 'output_text' && typeof c.text === 'string',
          )
        : null;
    return textPart ? textPart.text : '';
  }
  return extractContentText(data.choices?.[0]?.message?.content);
}

export class ModelProviderRouter {
  constructor(options = {}) {
    this.opencodeApiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || options.opencodeApiKey;
    this.defaultModel = options.defaultModel || 'deepseek-flash';
    this.endpoint =
      options.endpoint ||
      process.env.OPENCODE_ENDPOINT ||
      PROVIDER_ENDPOINTS[PROVIDER_IDS.OPENCODE_GO];
    this.api = options.api || process.env.OPENCODE_API_MODE;
  }

  getAvailableModels() {
    return MODEL_CATALOG.map((model) => ({
      ...model,
      configured: Boolean(this.opencodeApiKey)
    }));
  }

  async generate({ model = this.defaultModel, messages = [], tools = [], reasoning = { effort: 'high', exclude: true }, temperature = 0.42, signal }) {
    const activeKey = this.opencodeApiKey;

    // No key: the deterministic local agent is an explicit offline mode. Mark
    // the result so callers can tell simulated output from a real answer.
    if (!activeKey) {
      return { ...this.simulateLocalAgentResponse(messages, tools), offline: true };
    }

    const api = resolveApiMode({ endpoint: this.endpoint, api: this.api });
    const body = {
      model,
      temperature: Number.isFinite(temperature) ? temperature : 0.42,
      reasoning:
        reasoning && typeof reasoning === 'object'
          ? reasoning
          : { effort: String(reasoning || 'high'), exclude: true }
    };
    if (api === 'responses') body.input = messages;
    else body.messages = messages;
    if (Array.isArray(tools) && tools.length > 0) body.tools = tools;

    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`,
          [OPENCODE_SESSION_HEADER]: newOpencodeSessionId()
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // A configured provider that cannot be reached must fail loudly: never
      // fabricate a simulated answer that looks real to CLI/swarm callers.
      throw new Error(
        `OpenCode Go request failed: ${err?.message || 'network error'}`,
        { cause: err }
      );
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const error = new Error(
        `OpenCode Go request failed: HTTP ${res.status}${detail ? ` ${detail}` : ` ${res.statusText}`}`
      );
      error.status = res.status;
      throw error;
    }

    const data = await res.json();
    return {
      content: stripThinkingBlocks(extractAssistantText(data)),
      toolCalls: data?.choices?.[0]?.message?.tool_calls || [],
      raw: data
    };
  }

  simulateLocalAgentResponse(messages, tools) {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastUserMessage.toLowerCase();

    // Check if tools available
    const hasTools = Array.isArray(tools) && tools.length > 0;

    if (hasTools) {
      if (lower.includes('list') || lower.includes('files') || lower.includes('structure') || lower.includes('inspect')) {
        const listTool = tools.find(t => t.name === 'list_directory');
        if (listTool) {
          return {
            content: "I will inspect the project workspace directory.",
            toolCalls: [{ id: 'call_1', function: { name: 'list_directory', arguments: JSON.stringify({ dirPath: '.' }) } }]
          };
        }
      }

      if (lower.includes('git') || lower.includes('status') || lower.includes('branch')) {
        const gitTool = tools.find(t => t.name === 'git_status');
        if (gitTool) {
          return {
            content: "Checking Git status...",
            toolCalls: [{ id: 'call_2', function: { name: 'git_status', arguments: JSON.stringify({}) } }]
          };
        }
      }
    }

    // Direct text response
    return {
      content: `[CoreZ Agent - Offline Mode]\nAnalyzed request: "${lastUserMessage.slice(0, 100)}"\nWorkspace inspection complete. All systems ready.`,
      toolCalls: []
    };
  }

  async generateEmbeddings({ input, model, signal }) {
    const inputs = Array.isArray(input) ? input : [input];
    const embedModel = model || process.env.OPENCODE_EMBED_MODEL || 'perplexity/pplx-embed-v1-0.6b';
    const endpoint = process.env.OPENCODE_EMBED_ENDPOINT
      || process.env.OPENCODE_EMBEDDINGS_ENDPOINT
      || 'https://opencode.ai/zen/go/v1/embeddings';

    if (this.opencodeApiKey) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.opencodeApiKey}`
          },
          body: JSON.stringify({ model: embedModel, input: inputs }),
          signal
        });

        if (res.ok) {
          const data = await res.json();
          const embeddings = (data.data || []).map(item => item.embedding);
          return {
            embeddings,
            model: data.model || embedModel,
            raw: data
          };
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.warn(`[ModelProviderRouter] Embeddings request failed: ${err.message}. Activating local fallback.`);
      }
    }

    // Local deterministic embedding fallback (Offline Mode)
    const simulatedEmbeddings = inputs.map(str => {
      const vec = new Float32Array(1024);
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        vec[i % 1024] += (code / 255) - 0.5;
      }
      // Normalize vector
      let norm = 0;
      for (let i = 0; i < 1024; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;
      return Array.from(vec.map(v => v / norm));
    });

    return {
      embeddings: simulatedEmbeddings,
      model: embedModel,
      offline: true
    };
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude ? dotProduct / magnitude : 0;
}
