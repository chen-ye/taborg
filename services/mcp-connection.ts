import type { CallToolResult, Prompt, Resource, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Signal } from 'signal-polyfill';

// A resource content item returned when reading a resource
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

// A prompt message returned when getting a prompt
export interface PromptMessage {
  role: 'user' | 'assistant';
  content:
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } };
}

// Result from getting a prompt
export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

class McpConnectionService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private maxDelay = 30000;
  private baseDelay = 1000;
  private isEnabled = true;

  // Signals for UI
  private _status = new Signal.State<ConnectionStatus>('disconnected');
  private _error = new Signal.State<string | null>(null);

  private statusListeners: ((status: ConnectionStatus) => void)[] = [];
  private errorListeners: ((error: string | null) => void)[] = [];

  get status() {
    return this._status;
  }

  get error() {
    return this._error;
  }

  public onStatusChange(callback: (status: ConnectionStatus) => void) {
    this.statusListeners.push(callback);
    callback(this._status.get()); // Initial call
  }

  public onErrorChange(callback: (error: string | null) => void) {
    this.errorListeners.push(callback);
    callback(this._error.get()); // Initial call
  }

  private setStatus(status: ConnectionStatus) {
    this._status.set(status);
    this.statusListeners.forEach((cb) => {
      cb(status);
    });
  }

  private setError(error: string | null) {
    this._error.set(error);
    this.errorListeners.forEach((cb) => {
      cb(error);
    });
  }

  // Tool Registry
  private tools: Map<string, { tool: Tool; handler: (args: Record<string, unknown>) => Promise<CallToolResult> }> =
    new Map();

  // Resource Registry
  private resources: Map<string, { resource: Resource; handler: () => Promise<ResourceContent[]> }> = new Map();

  // Prompt Registry
  private prompts: Map<
    string,
    { prompt: Prompt; handler: (args?: Record<string, string>) => Promise<GetPromptResult> }
  > = new Map();

  public init() {
    this.connect();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (enabled) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  public retryConnection() {
    if (this.isEnabled) {
      this.disconnect();
      this.connect();
    }
  }

  private connect() {
    if (!this.isEnabled || this.status.get() === 'connected' || this.status.get() === 'connecting') return;

    this.setStatus('connecting');
    this.setError(null);

    try {
      this.ws = new WebSocket('ws://localhost:3003');

      this.ws.onopen = () => {
        console.log('MCP: Connected');
        this.setStatus('connected');
        this.attempt = 0;
        this.setError(null);

        // Notifications only if we have tools, but connected client should ask
        // Sending notifications immediately might be racey if client isn't listening yet,
        // but it doesn't hurt to announce we have changed (from init state)
        this.sendToolNotification();
        this.sendResourceNotification();
        this.sendPromptNotification();

        // Start keepalive
        this.startKeepAlive();
      };

      this.ws.onclose = () => {
        console.log('MCP: Disconnected');
        this.setStatus('disconnected');
        this.stopKeepAlive();
        this.scheduleReconnect();
      };

      this.ws.onerror = (e) => {
        console.error('MCP: Connection error', e);
        this.setError('Connection failed');
        // onclose will be called after onerror usually
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('MCP: Failed to parse message', e);
        }
      };
    } catch (e) {
      console.error('MCP: Failed to create WebSocket', e);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    // specific interval to keep Chrome service worker alive (every 20s is safe, limit is ~30s)
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
      }
    }, 20000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private scheduleReconnect() {
    if (!this.isEnabled) return;

    this.stopKeepAlive();
    const delay = Math.min(this.baseDelay * 2 ** this.attempt, this.maxDelay);
    console.log(`MCP: Reconnecting in ${delay}ms (attempt ${this.attempt + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.attempt++;
      this.connect();
    }, delay);
  }

  private async handleMessage(message: { id?: string | number; method: string; params: unknown }) {
    if (message.method === 'initialize') {
      const id = message.id;
      if (id !== undefined) {
        this.sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: true,
              },
              resources: {
                listChanged: true,
                subscribe: false,
              },
              prompts: {
                listChanged: true,
              },
            },
            serverInfo: {
              name: 'TabOrg',
              version: '0.1.0',
            },
          },
        });
      }
    } else if (message.method === 'notifications/initialized') {
      // Client has acknowledged initialization
      // We can send initial list updates now if needed, but we do that on connect mostly.
    } else if (message.method === 'tools/list') {
      const id = message.id;
      if (id !== undefined) {
        const toolsList = Array.from(this.tools.values()).map((t) => t.tool);
        this.sendMessage({
          jsonrpc: '2.0',
          id,
          result: { tools: toolsList },
        });
      }
    } else if (message.method === 'tools/call' && message.id !== undefined) {
      await this.handleToolCall(
        message as { id: string | number; params: { name: string; arguments?: Record<string, unknown> } },
      );
    } else if (message.method === 'resources/list') {
      const id = message.id;
      if (id !== undefined) {
        const resourcesList = Array.from(this.resources.values()).map((r) => r.resource);
        this.sendMessage({
          jsonrpc: '2.0',
          id,
          result: { resources: resourcesList },
        });
      }
    } else if (message.method === 'resources/read') {
      await this.handleReadResource(message as { id: string; params: { uri: string } });
    } else if (message.method === 'prompts/list') {
      const id = message.id;
      if (id !== undefined) {
        const promptsList = Array.from(this.prompts.values()).map((p) => p.prompt);
        this.sendMessage({
          jsonrpc: '2.0',
          id,
          result: { prompts: promptsList },
        });
      }
    } else if (message.method === 'prompts/get') {
      await this.handleGetPrompt(
        message as { id: string; params: { name: string; arguments?: Record<string, string> } },
      );
    }
  }

  private sendToolNotification() {
    this.sendMessage({
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    });
  }

  private sendResourceNotification() {
    this.sendMessage({
      jsonrpc: '2.0',
      method: 'notifications/resources/list_changed',
    });
  }

  private sendPromptNotification() {
    this.sendMessage({
      jsonrpc: '2.0',
      method: 'notifications/prompts/list_changed',
    });
  }

  private async handleGetPrompt(message: { id: string; params: { name: string; arguments?: Record<string, string> } }) {
    const { id, params } = message;
    const promptEntry = this.prompts.get(params.name);

    if (!promptEntry) {
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Prompt ${params.name} not found` },
      });
      return;
    }

    try {
      const result = await promptEntry.handler(params.arguments);
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: errorMessage },
      });
    }
  }

  private async handleReadResource(message: { id: string; params: { uri: string } }) {
    const { id, params } = message;
    const resourceEntry = this.resources.get(params.uri);

    if (!resourceEntry) {
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Resource ${params.uri} not found` },
      });
      return;
    }

    try {
      const contents = await resourceEntry.handler();
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        result: { contents },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message },
      });
    }
  }

  private async handleToolCall(message: {
    id: string | number;
    params: { name: string; arguments?: Record<string, unknown> };
  }) {
    const { id, params } = message;
    const toolEntry = this.tools.get(params.name);

    if (!toolEntry) {
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool ${params.name} not found` },
      });
      return;
    }

    try {
      const result = await toolEntry.handler(params.arguments || {});

      this.sendMessage({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      this.sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: errorMessage },
      });
    }
  }

  private sendMessage(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public registerTool(tool: Tool, handler: (args: Record<string, unknown>) => Promise<CallToolResult>) {
    this.tools.set(tool.name, { tool, handler });
    if (this.status.get() === 'connected') {
      this.sendToolNotification();
    }
  }

  public registerResource(resource: Resource, handler: () => Promise<ResourceContent[]>) {
    this.resources.set(resource.uri, { resource, handler });
    if (this.status.get() === 'connected') {
      this.sendResourceNotification();
    }
  }

  public registerPrompt(prompt: Prompt, handler: (args?: Record<string, string>) => Promise<GetPromptResult>) {
    this.prompts.set(prompt.name, { prompt, handler });
    if (this.status.get() === 'connected') {
      this.sendPromptNotification();
    }
  }
}

export const mcpService = new McpConnectionService();
