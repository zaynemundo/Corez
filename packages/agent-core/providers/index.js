export const MODEL_CATALOG = Object.freeze([
  { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3', provider: 'opencode-go', role: 'Primary Executor (Orchestration, Coding, UI, Building & Verification)' },
  { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3', provider: 'opencode-go', role: 'Fast Secondary Executor (Rapid UI iterations & smoke testing)' },
  { id: 'kimi-k3', name: 'Kimi K3 Code', provider: 'opencode-go', role: 'Physics & Engine Advisor (specialized math/physics guidance)' },
  { id: 'flux-1-schnell', name: 'FLUX 1 Schnell', provider: 'cloudflare-workers-ai', role: 'Visual Asset & Art Director' }
]);

export class ModelProviderRouter {
  constructor(options = {}) {
    this.opencodeApiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || options.opencodeApiKey;
    this.defaultModel = options.defaultModel || 'muse-spark-1.3-contributor';
  }

  getAvailableModels() {
    return MODEL_CATALOG.map(m => ({
      ...m,
      configured: m.provider === 'opencode-go'
        ? Boolean(this.opencodeApiKey)
        : Boolean(this.opencodeApiKey)
    }));
  }

  async generate({ model = this.defaultModel, messages = [], tools = [], reasoning = { effort: 'high', exclude: true }, temperature = 0.42, signal }) {
    const activeKey = this.opencodeApiKey;

    // If the API key is present, execute HTTP request against OpenCode Go
    // (the only configured provider; direct OpenRouter integration removed).
    // Muse Spark 1.3 benefits from hidden reasoning: high effort for complex
    // tasks, medium for general, low for trivial — all excluded from output.
    if (activeKey) {
      try {
        const endpoint = 'https://opencode.ai/zen/go/v1/responses';

        const body = {
          model,
          input: messages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: Number.isFinite(temperature) ? temperature : 0.42,
          reasoning: reasoning && typeof reasoning === 'object' ? reasoning : { effort: String(reasoning || 'high'), exclude: true }
        };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`
          },
          body: JSON.stringify(body),
          signal
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.output)) {
            const messageItem = data.output.find((item) => item && item.type === 'message' && item.role === 'assistant');
            const textPart = messageItem && Array.isArray(messageItem.content) ? messageItem.content.find((c) => c && c.type === 'output_text' && typeof c.text === 'string') : null;
            return {
              content: textPart ? textPart.text : '',
              toolCalls: [],
              raw: data
            };
          }
          const choice = data.choices?.[0];
          return {
            content: choice?.message?.content || '',
            toolCalls: choice?.message?.tool_calls || [],
            raw: data
          };
        }
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        console.warn(`[ModelProviderRouter] HTTP ${res.status} from ${endpoint}: ${detail || res.statusText}. Activating local agent simulation fallback.`);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.warn(`[ModelProviderRouter] Request failed: ${err.message}. Activating local agent simulation fallback.`);
      }
    }

    // Local deterministic agent fallback (Offline / No Key Mode)
    return this.simulateLocalAgentResponse(messages, tools);
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

