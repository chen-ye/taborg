import { createServer } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

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
  private wss: WebSocketServer | null = null;
  private activeConnection: WebSocket | null = null;

  // HTTP transports by session ID
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // ID Management for routing responses
  // Map<ProxyID, { SessionID, ClientID }>
  private responseMap = new Map<number | string, { sessionId: string; originalId: number | string }>();

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
    // Handle all MCP requests at /mcp endpoint
    app.all('/mcp', async (req, res) => {
      console.log(
        `[HTTP] ${req.method} ${req.originalUrl || req.url} - Session: ${req.headers['mcp-session-id'] || 'None'}`,
      );
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle GET for SSE streams
      if (req.method === 'GET') {
        const transport = this.getOrCreateTransport(sessionId);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Handle DELETE for session cleanup
      if (req.method === 'DELETE') {
        if (sessionId) {
          const transport = this.transports.get(sessionId);
          if (transport) {
            await transport.close();
            this.transports.delete(sessionId);
          }
        }
        res.status(200).json({ success: true });
        return;
      }

      // Handle POST for new sessions or existing sessions
      if (req.method === 'POST') {
        const transport = this.getOrCreateTransport(sessionId);

        // Ensure transport is set up to handle incoming messages from Client
        if (!transport.onmessage) {
          transport.onmessage = (message: JSONRPCMessage) => {
            if (transport.sessionId) {
              this.forwardToExtension(message, transport.sessionId);
            }
          };
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body);
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      console.error(`[HTTP] Method not allowed: ${req.method}`);
    });

    app.listen(HTTP_PORT, () => {
      console.error(`HTTP MCP server listening on http://localhost:${HTTP_PORT}/mcp`);
    });
  }

  // Helper to deduplicate transport creation logic
  private getOrCreateTransport(sessionId?: string): StreamableHTTPServerTransport {
    if (sessionId) {
      const existing = this.transports.get(sessionId);
      if (existing) return existing;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newSessionId) => {
        this.transports.set(newSessionId, transport);
        console.log(`[Session] Created new session: ${newSessionId}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && this.transports.has(sid)) {
        this.transports.delete(sid);
        console.log(`[Session] Closed session: ${sid}`);
      }
    };

    return transport;
  }

  private setupWebSocket() {
    if (!this.wss) return;
    this.wss.on('connection', (ws) => {
      console.log('[WS] Extension connected');
      this.activeConnection = ws;

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCMessage;
          this.broadcastToClients(message);
        } catch (e) {
          console.error('Failed to parse extension message', e);
        }
      });

      ws.on('close', () => {
        console.log('[WS] Extension disconnected');
        this.activeConnection = null;
      });

      ws.on('error', (err) => {
        console.error('[WS] Connection error:', err);
      });
    });
  }

  private forwardToExtension(message: JSONRPCMessage, sessionId: string) {
    if (this.activeConnection && this.activeConnection.readyState === WebSocket.OPEN) {
      if ('id' in message && message.id !== undefined) {
        // It's a Request (or Response? Client shouldn't send Response to Server usually, but safe to handle)
        // We rewrite the ID to ensure uniqueness across all clients
        const proxyId = crypto.randomUUID();
        this.responseMap.set(proxyId, { sessionId, originalId: message.id });

        // Clone message to avoid mutating original if passed by ref (though parsed JSON is fresh)
        const rewrittenMessage = { ...message, id: proxyId };
        this.activeConnection.send(JSON.stringify(rewrittenMessage));
      } else {
        // Notification - just forward
        this.activeConnection.send(JSON.stringify(message));
      }
    } else {
      console.error('Dropping message to extension (not connected):', message);
    }
  }

  private broadcastToClients(message: JSONRPCMessage) {
    if ('id' in message && message.id !== undefined) {
      // It's a Response (from Extension)
      // Look up who asked for it
      const context = this.responseMap.get(message.id);
      if (context) {
        const { sessionId, originalId } = context;
        this.responseMap.delete(message.id);

        const transport = this.transports.get(sessionId);
        if (transport) {
          const restoredMessage = { ...message, id: originalId };
          try {
            transport.send(restoredMessage);
          } catch (e) {
            console.error(`Failed to send response to session ${sessionId}:`, e);
          }
        } else {
          console.error(`Session ${sessionId} not found for response ${originalId}`);
        }
      } else {
        // Unknown ID? Might be a spontaneous request from Extension?
        // If Extension acts as client, we might need to broadcast requests.
        // But for now, assume Unmatched ID = Drop or Log
        // If we support server-initiated requests (e.g. sampling), we just broadcast with original ID?
        // For now, let's broadcast requests (method != undefined) and drop unmapped responses
        if ('method' in message) {
          this.broadcastToAll(message);
        } else {
          console.warn('Received response with unknown ID:', message.id);
        }
      }
    } else {
      // Notification
      if ('method' in message && message.method === 'ping') {
        // Internal keepalive, do not broadcast
        return;
      }
      this.broadcastToAll(message);
    }
  }

  private broadcastToAll(message: JSONRPCMessage) {
    for (const transport of this.transports.values()) {
      try {
        transport.send(message);
      } catch (e) {
        console.error('Failed to send to client transport:', e);
      }
    }
  }
}

const server = new McpProxyServer();
server.start().catch(console.error);
