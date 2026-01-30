import { createServer } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';

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
  // Map<InstanceID, WebSocket>
  private instanceConnections: Map<string, WebSocket> = new Map();

  // HTTP transports by session ID
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // ID Management for routing responses
  // Map<ProxyID, { SessionID, ClientID }>
  private responseMap = new Map<number | string, { sessionId: string; originalId: number | string }>();

  async start() {
    // Check if ports are already in use (another instance running)
    const HTTP_PORT = Number(process.env.HTTP_PORT) || 3000;
    const WS_PORT = Number(process.env.WS_PORT) || 3003;

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
    this.setupHttpServer(HTTP_PORT);

    console.error(`MCP Proxy Server running on HTTP port ${HTTP_PORT} and WS port ${WS_PORT}`);
  }

  private setupHttpServer(port: number) {
    const app = express();
    app.use(express.json());

    // Handle all MCP requests at /:instanceId/mcp endpoint
    app.all('/:instanceId/mcp', async (req, res) => {
      const instanceId = req.params.instanceId;
      console.log(
        `[HTTP] ${req.method} ${req.originalUrl || req.url} - Instance: ${instanceId} - Session: ${req.headers['mcp-session-id'] || 'None'}`,
      );

      const connection = this.instanceConnections.get(instanceId);
      if (!connection || connection.readyState !== WebSocket.OPEN) {
        console.warn(`[HTTP] Instance ${instanceId} not connected`);
        res.status(404).json({ error: `Instance ${instanceId} not connected` });
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Handle GET for SSE streams
      if (req.method === 'GET') {
        const transport = this.getOrCreateTransport(sessionId, instanceId);
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
        const transport = this.getOrCreateTransport(sessionId, instanceId);

        // Ensure transport is set up to handle incoming messages from Client
        if (!transport.onmessage) {
          transport.onmessage = (message: JSONRPCMessage) => {
            if (transport.sessionId) {
              this.forwardToExtension(message, transport.sessionId, instanceId);
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

    app.listen(port, () => {
      console.error(`HTTP MCP server listening on http://localhost:${port}/:instanceId/mcp`);
    });
  }

  // Helper to deduplicate transport creation logic
  private getOrCreateTransport(sessionId: string | undefined, instanceId: string): StreamableHTTPServerTransport {
    if (sessionId) {
      const existing = this.transports.get(sessionId);
      if (existing) return existing;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newSessionId) => {
        this.transports.set(newSessionId, transport);
        console.log(`[Session] Created new session: ${newSessionId} for instance ${instanceId}`);
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
    this.wss.on('connection', (ws, req) => {
      // Parse instanceId from URL: ws://localhost:3003/instanceId
      const url = req.url || '/';
      const instanceId = url.substring(1) || 'default'; // handle / or /default

      console.log(`[WS] Extension connected: ${instanceId}`);
      this.instanceConnections.set(instanceId, ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCMessage;
          this.broadcastToClients(message, instanceId); // We might need to map back to specific clients if we track them per instance
        } catch (e) {
          console.error('Failed to parse extension message', e);
        }
      });

      ws.on('close', () => {
        console.log(`[WS] Extension disconnected: ${instanceId}`);
        if (this.instanceConnections.get(instanceId) === ws) {
          this.instanceConnections.delete(instanceId);
        }
      });

      ws.on('error', (err) => {
        console.error('[WS] Connection error:', err);
      });
    });
  }

  private forwardToExtension(message: JSONRPCMessage, sessionId: string, instanceId: string) {
    const connection = this.instanceConnections.get(instanceId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      if ('id' in message && message.id !== undefined) {
        // It's a Request
        // We rewrite the ID to ensure uniqueness across all clients
        const proxyId = crypto.randomUUID();
        this.responseMap.set(proxyId, { sessionId, originalId: message.id });

        // Clone message to avoid mutating original if passed by ref
        const rewrittenMessage = { ...message, id: proxyId };
        connection.send(JSON.stringify(rewrittenMessage));
      } else {
        // Notification - just forward
        connection.send(JSON.stringify(message));
      }
    } else {
      console.error(`Dropping message to extension ${instanceId} (not connected):`, message);
    }
  }

  private broadcastToClients(message: JSONRPCMessage, _instanceId: string) {
    // Logic is simplified: If response, find who asked. If notification, broadcast to ALL connected clients?
    // Ideally we should track which client session belongs to which instance interest.
    // But for now, since HTTP request is ephemeral or SSE stream is specific, let's see.
    // Since transport is created PER REQUEST/Session, and we passed it to getOrCreateTransport,
    // we don't strictly associate transport to instance connection permanently in the map,
    // but the responseMap guides responses.

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
        // Unknown ID - drop or log
        // console.warn('Received response with unknown ID:', message.id);
      }
    } else {
      // Notification
      if ('method' in message && message.method === 'ping') {
        return;
      }

      // For notifications (like 'list_changed'), we should probably only broadcast to sessions that interacted with this instance?
      // Or just broadcast to ALL open transports?
      // Since SSE clients might be listening to ANY instance, broadcasting to all is safest for now
      // unless we want to subscribe clients to instances.
      // Given the stateless HTTP nature, a client pulling /instance/mcp is engaging there.
      // But SSE stream is /instance/mcp (GET).
      // So we can associate transport with instance!

      // Refinement: We should probably only send to transports that were created on a path matching the instance?
      // But for now, broadcast all is okay for low volume.
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
