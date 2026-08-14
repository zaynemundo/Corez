// McpClient: Model Context Protocol (MCP) client for CoreZ AI.
// Supports JSON-RPC 2.0 communication over in-memory, stdio subprocess, and HTTP transports.

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class McpClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'corez-mcp-client';
    this.version = options.version || '1.0.0';
    this.transport = options.transport || 'memory'; // 'memory' | 'stdio' | 'http'
    this.serverCommand = options.serverCommand || null; // for stdio: e.g. ['node', 'server.js']
    this.serverUrl = options.serverUrl || null;         // for http: e.g. 'http://localhost:3000/mcp'
    this.inMemoryHandler = options.inMemoryHandler || null; // for testing

    this.process = null;
    this.connected = false;
    this.serverCapabilities = null;
    this.serverInfo = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.stdoutBuffer = '';
  }

  async connect() {
    if (this.connected) return;

    if (this.transport === 'stdio') {
      if (!this.serverCommand || !Array.isArray(this.serverCommand) || this.serverCommand.length === 0) {
        throw new Error('McpClient stdio transport requires serverCommand array (e.g. ["node", "server.js"])');
      }
      const [cmd, ...args] = this.serverCommand;
      this.process = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      this.process.stdout.on('data', (chunk) => {
        this.stdoutBuffer += chunk.toString('utf8');
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop(); // Keep incomplete tail
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line.trim());
            this.#handleIncomingMessage(msg);
          } catch {
            // non-json line
          }
        }
      });

      this.process.on('error', (err) => {
        this.emit('error', err);
      });

      this.process.on('exit', (code) => {
        this.connected = false;
        this.emit('close', code);
      });
    }

    // Handshake: initialize
    const initResponse = await this.#sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: {
        name: this.name,
        version: this.version
      },
      capabilities: {
        tools: {}
      }
    });

    this.serverCapabilities = initResponse?.capabilities || {};
    this.serverInfo = initResponse?.serverInfo || {};
    this.connected = true;

    // Send initialized notification
    this.#sendNotification('notifications/initialized', {});
  }

  async listTools() {
    if (!this.connected) {
      await this.connect();
    }
    const response = await this.#sendRequest('tools/list', {});
    return response?.tools || [];
  }

  async callTool(name, args = {}) {
    if (!this.connected) {
      await this.connect();
    }
    const response = await this.#sendRequest('tools/call', {
      name,
      arguments: args
    });
    return response;
  }

  async disconnect() {
    if (!this.connected && !this.process) return;
    this.connected = false;
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // ignore
      }
      this.process = null;
    }
    this.pendingRequests.clear();
  }

  #handleIncomingMessage(msg) {
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message || `MCP error ${msg.error.code}`));
      } else {
        resolve(msg.result);
      }
    }
  }

  async #sendRequest(method, params = {}) {
    const id = this.requestId++;
    const req = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    if (this.transport === 'memory' && this.inMemoryHandler) {
      return this.inMemoryHandler(req);
    }

    if (this.transport === 'http' && this.serverUrl) {
      const resp = await fetch(this.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      const data = await resp.json();
      if (data.error) {
        throw new Error(data.error.message || `MCP HTTP error ${data.error.code}`);
      }
      return data.result;
    }

    if (this.transport === 'stdio' && this.process) {
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        this.process.stdin.write(JSON.stringify(req) + '\n');
      });
    }

    throw new Error(`Unsupported MCP transport or missing handler: ${this.transport}`);
  }

  #sendNotification(method, params = {}) {
    const notif = { jsonrpc: '2.0', method, params };
    if (this.transport === 'stdio' && this.process) {
      this.process.stdin.write(JSON.stringify(notif) + '\n');
    }
  }
}
