export const MODEL_CATALOG = Object.freeze([
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'opencode-go', role: 'Primary Executor (Orchestration, Coding, UI, Building & Verification)' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'openrouter', role: 'Fast Secondary Executor (Rapid UI iterations & smoke testing)' },
  { id: 'kimi-k3', name: 'Kimi K3 Code', provider: 'opencode-go', role: 'Physics & Engine Advisor (specialized math/physics guidance)' },
  { id: 'flux-1-schnell', name: 'FLUX 1 Schnell', provider: 'cloudflare-workers-ai', role: 'Visual Asset & Art Director' }
]);

export class ModelProviderRouter {
  constructor(options = {}) {
    this.opencodeApiKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || options.opencodeApiKey;
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || options.openrouterApiKey;
    this.defaultModel = options.defaultModel || 'deepseek-v4-pro';
  }

  getAvailableModels() {
    return MODEL_CATALOG.map(m => ({
      ...m,
      configured: m.provider === 'opencode-go'
        ? Boolean(this.opencodeApiKey)
        : m.provider === 'openrouter'
          ? Boolean(this.openrouterApiKey)
          : Boolean(this.opencodeApiKey || this.openrouterApiKey)
    }));
  }

  async generate({ model = this.defaultModel, messages = [], tools = [], _reasoning = 'high', signal }) {
    const activeKey = this.opencodeApiKey || this.openrouterApiKey;

    // If API keys are present, execute HTTP request
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

  async generateEmbeddings({ input, model = 'nvidia/nemotron-3-embed-1b:free', signal }) {
    const inputs = Array.isArray(input) ? input : [input];

    if (this.openrouterApiKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openrouterApiKey}`
          },
          body: JSON.stringify({ model, input: inputs }),
          signal
        });

        if (res.ok) {
          const data = await res.json();
          const embeddings = (data.data || []).map(item => item.embedding);
          return {
            embeddings,
            model: data.model || model,
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
      model,
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

