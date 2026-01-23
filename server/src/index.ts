import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  GetPromptRequestSchema,
  type GetPromptResult,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  type Prompt,
  ReadResourceRequestSchema,
  type ReadResourceResult,
  type Resource,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { createServer } from 'node:net';
import { type WebSocket, WebSocketServer } from 'ws';

const HTTP_PORT = 3000;
const WS_PORT = 3003;

// Check if a port is in use
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

class McpProxyServer {
  private mcpServer: Server;
  private wss: WebSocketServer | null = null;
  private activeConnection: WebSocket | null = null;

  // We store the tools list as provided by the extension
  private availableTools: Tool[] = [];
  private toolsPromise: Promise<void> | null = null;
  private resolveTools: (() => void) | null = null;

  // Store resources list provided by the extension
  private availableResources: Resource[] = [];
  private resourcesPromise: Promise<void> | null = null;
  private resolveResources: (() => void) | null = null;

  // Store prompts list provided by the extension
  private availablePrompts: Prompt[] = [];
  private promptsPromise: Promise<void> | null = null;
  private resolvePrompts: (() => void) | null = null;

  // HTTP transports by session ID
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  constructor() {
    this.mcpServer = new Server(
      {
        name: 'taborg-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Initialize promises
    this.resetToolsPromise();
    this.resetResourcesPromise();
    this.resetPromptsPromise();

    this.setupMcpHandlers();
  }

  private resetToolsPromise() {
    this.toolsPromise = new Promise((resolve) => {
      this.resolveTools = resolve;
    });
  }

  private resetResourcesPromise() {
    this.resourcesPromise = new Promise((resolve) => {
      this.resolveResources = resolve;
    });
  }

  private resetPromptsPromise() {
    this.promptsPromise = new Promise((resolve) => {
      this.resolvePrompts = resolve;
    });
  }

  async start() {
    // Check if ports are already in use (another instance running)
    const httpInUse = await isPortInUse(HTTP_PORT);
    if (httpInUse) {
      console.error(`MCP server already running on port ${HTTP_PORT}. Exiting gracefully.`);
      process.exit(0);
    }

    const wsInUse = await isPortInUse(WS_PORT);
    if (wsInUse) {
      console.error(`WebSocket server already running on port ${WS_PORT}. Exiting gracefully.`);
      process.exit(0);
    }

    // Create WebSocket server now that we know port is free
    this.wss = new WebSocketServer({ port: WS_PORT });
    this.setupWebSocket();
    this.setupHttpServer();

    console.error(`MCP Proxy Server running on HTTP port ${HTTP_PORT} and WS port ${WS_PORT}`);
  }

  private setupHttpServer() {
    const app = express();
    app.use(express.json());

    // Handle all MCP requests at /mcp endpoint
    app.all('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle GET for SSE streams
      if (req.method === 'GET') {
        if (!sessionId || !this.transports.has(sessionId)) {
          res.status(400).json({ error: 'Invalid or missing session ID' });
          return;
        }
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Handle DELETE for session cleanup
      if (req.method === 'DELETE') {
        if (sessionId && this.transports.has(sessionId)) {
          const transport = this.transports.get(sessionId)!;
          await transport.close();
          this.transports.delete(sessionId);
        }
        res.status(200).json({ success: true });
        return;
      }

      // Handle POST for new sessions or existing sessions
      if (req.method === 'POST') {
        // Check if this is an existing session
        if (sessionId && this.transports.has(sessionId)) {
          const transport = this.transports.get(sessionId)!;
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // New session - create transport
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId) => {
            this.transports.set(newSessionId, transport);
            console.error(`New MCP session: ${newSessionId}`);
          },
        });

        // Clean up on close
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            this.transports.delete(sid);
            console.error(`MCP session closed: ${sid}`);
          }
        };

        // Connect the MCP server to this transport
        await this.mcpServer.connect(transport);

        // Handle the request
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(405).json({ error: 'Method not allowed' });
    });

    app.listen(HTTP_PORT, () => {
      console.error(`HTTP MCP server listening on http://localhost:${HTTP_PORT}/mcp`);
    });
  }

  private setupWebSocket() {
    if (!this.wss) return;
    this.wss.on('connection', (ws) => {
      console.error('Extension connected');
      this.activeConnection = ws;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleExtensionMessage(message);
        } catch (e) {
          console.error('Failed to parse extension message', e);
        }
      });

      ws.on('close', () => {
        console.error('Extension disconnected');
        this.activeConnection = null;
        this.availableTools = [];
        this.availableResources = [];
        this.availablePrompts = [];
        this.resetToolsPromise();
        this.resetResourcesPromise();
        this.resetPromptsPromise();
      });

      // Request lists immediately on connection
      this.requestToolList();
      this.requestResourceList();
      this.requestPromptList();
    });
  }

  private requestToolList() {
    if (this.activeConnection) {
      this.activeConnection.send(JSON.stringify({ method: 'listTools' }));
    }
  }

  private requestResourceList() {
    if (this.activeConnection) {
      this.activeConnection.send(JSON.stringify({ method: 'listResources' }));
    }
  }

  private requestPromptList() {
    if (this.activeConnection) {
      this.activeConnection.send(JSON.stringify({ method: 'listPrompts' }));
    }
  }

  private handleExtensionMessage(message: Record<string, unknown>) {
    if (message.method === 'toolsList') {
      const params = message.params as { tools: Tool[] };
      this.availableTools = params.tools;
      console.error(
        'Updated tools list from extension:',
        this.availableTools.map((t) => t.name),
      );

      if (this.resolveTools) {
        this.resolveTools();
      }
    } else if (message.method === 'resourcesList') {
      const params = message.params as { resources: Resource[] };
      this.availableResources = params.resources;
      console.error(
        'Updated resources list from extension:',
        this.availableResources.map((r) => r.name),
      );

      if (this.resolveResources) {
        this.resolveResources();
      }
    } else if (message.method === 'promptsList') {
      const params = message.params as { prompts: Prompt[] };
      this.availablePrompts = params.prompts;
      console.error(
        'Updated prompts list from extension:',
        this.availablePrompts.map((p) => p.name),
      );

      if (this.resolvePrompts) {
        this.resolvePrompts();
      }
    }
  }

  private async waitForTools(timeoutMs: number = 60000): Promise<void> {
    if (this.availableTools.length > 0) return;

    console.error('Waiting for tools...');

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Timeout waiting for tools')), timeoutMs);
    });

    try {
      await Promise.race([this.toolsPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  private async waitForResources(timeoutMs: number = 60000): Promise<void> {
    if (this.availableResources.length > 0) return;

    console.error('Waiting for resources...');

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Timeout waiting for resources')), timeoutMs);
    });

    try {
      await Promise.race([this.resourcesPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  private async waitForPrompts(timeoutMs: number = 60000): Promise<void> {
    if (this.availablePrompts.length > 0) return;

    console.error('Waiting for prompts...');

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Timeout waiting for prompts')), timeoutMs);
    });

    try {
      await Promise.race([this.promptsPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  private setupMcpHandlers() {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        await this.waitForTools();
      } catch (e) {
        console.error('Failed to wait for tools:', e);
      }

      return {
        tools: this.availableTools,
      };
    });

    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        await this.waitForResources();
      } catch (e) {
        console.error('Failed to wait for resources:', e);
      }

      return {
        resources: this.availableResources,
      };
    });

    this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
      try {
        await this.waitForPrompts();
      } catch (e) {
        console.error('Failed to wait for prompts:', e);
      }

      return {
        prompts: this.availablePrompts,
      };
    });

    this.mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (!this.activeConnection) {
        throw new Error('Extension not connected');
      }

      return new Promise<GetPromptResult>((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);

        const timeout = setTimeout(() => {
          this.activeConnection?.removeListener('message', handleResponse);
          reject(new Error('Get prompt timed out'));
        }, 30000);

        const handleResponse = (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as { id?: string; error?: string; result?: GetPromptResult };
            if (message.id === id) {
              clearTimeout(timeout);
              this.activeConnection?.removeListener('message', handleResponse);

              if (message.error) {
                reject(new Error(message.error));
              } else if (message.result) {
                resolve(message.result);
              }
            }
          } catch (_e) {
            // ignore
          }
        };

        this.activeConnection?.on('message', handleResponse);

        this.activeConnection?.send(
          JSON.stringify({
            id,
            method: 'getPrompt',
            params: {
              name: request.params.name,
              arguments: request.params.arguments,
            },
          }),
        );
      });
    });

    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!this.activeConnection) {
        throw new Error('Extension not connected');
      }

      return new Promise<ReadResourceResult>((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);

        const timeout = setTimeout(() => {
          this.activeConnection?.removeListener('message', handleResponse);
          reject(new Error('Resource read timed out'));
        }, 30000);

        const handleResponse = (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as {
              id?: string;
              error?: string;
              result?: { contents: ReadResourceResult['contents'] };
            };
            if (message.id === id) {
              clearTimeout(timeout);
              this.activeConnection?.removeListener('message', handleResponse);

              if (message.error) {
                reject(new Error(message.error));
              } else if (message.result) {
                resolve({
                  contents: message.result.contents,
                });
              }
            }
          } catch (_e) {
            // ignore
          }
        };

        this.activeConnection?.on('message', handleResponse);

        this.activeConnection?.send(
          JSON.stringify({
            id,
            method: 'readResource',
            params: {
              uri: request.params.uri,
            },
          }),
        );
      });
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.activeConnection) {
        throw new Error('Extension not connected');
      }

      return new Promise<CallToolResult>((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);

        const timeout = setTimeout(() => {
          this.activeConnection?.removeListener('message', handleResponse);
          reject(new Error('Tool execution timed out'));
        }, 30000);

        const handleResponse = (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as { id?: string; error?: string; result?: CallToolResult };
            if (message.id === id) {
              clearTimeout(timeout);
              this.activeConnection?.removeListener('message', handleResponse);

              if (message.error) {
                resolve({
                  content: [{ type: 'text', text: `Error: ${message.error}` }],
                  isError: true,
                });
              } else if (message.result) {
                resolve(message.result);
              }
            }
          } catch (_e) {
            // ignore other messages
          }
        };

        this.activeConnection?.on('message', handleResponse);

        this.activeConnection?.send(
          JSON.stringify({
            id,
            method: 'callTool',
            params: {
              name: request.params.name,
              arguments: request.params.arguments,
            },
          }),
        );
      });
    });
  }
}

const server = new McpProxyServer();
server.start().catch(console.error);
