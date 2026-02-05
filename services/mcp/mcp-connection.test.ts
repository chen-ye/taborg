import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpConnectionService } from './mcp-connection';

let lastWs: MockWebSocket | null = null;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 1; // OPEN
  send = vi.fn();
  close = vi.fn();

  constructor(public url: string) {
    lastWs = this;
  }
}

describe('McpConnectionService', () => {
  let service: McpConnectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    lastWs = null;
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
      identity: {
        getProfileUserInfo: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      },
      runtime: {
        getManifest: () => ({ version: '1.0.0' }),
      },
    };
    service = new McpConnectionService();
  });

  it('should transition to connecting status on init', async () => {
    service.init();
    expect(service.status.get()).toBe('connecting');
  });

  it('should connect and transition to connected', async () => {
    service.init();
    await new Promise(r => setTimeout(r, 10));
    
    if (lastWs && lastWs.onopen) lastWs.onopen();
    expect(service.status.get()).toBe('connected');
  });

  it('should handle registration and send notifications when connected', async () => {
    service.init();
    await new Promise(r => setTimeout(r, 10));
    if (lastWs && lastWs.onopen) lastWs.onopen();

    service.registerTool({ name: 'test-tool', description: 'desc' }, async () => ({ content: [] }));
    
    expect(lastWs?.send).toHaveBeenCalledWith(expect.stringContaining('notifications/tools/list_changed'));
  });

  it('should handle JSON-RPC initialize request', async () => {
    service.init();
    await new Promise(r => setTimeout(r, 10));
    if (lastWs && lastWs.onopen) lastWs.onopen();

    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    });

    if (lastWs && lastWs.onmessage) lastWs.onmessage({ data: initRequest });

    expect(lastWs?.send).toHaveBeenCalledWith(expect.stringContaining('"result":'));
    expect(lastWs?.send).toHaveBeenCalledWith(expect.stringContaining('"protocolVersion":'));
  });

  it('should handle tool call requests', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] });
    service.registerTool({ name: 'my-tool', description: 'desc' }, handler);
    
    service.init();
    await new Promise(r => setTimeout(r, 10));
    if (lastWs && lastWs.onopen) lastWs.onopen();

    const callRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: { name: 'my-tool', arguments: { arg1: 'val' } }
    });

    if (lastWs && lastWs.onmessage) lastWs.onmessage({ data: callRequest });

    // Wait for async handler
    await new Promise(r => setTimeout(r, 50));

    expect(handler).toHaveBeenCalledWith({ arg1: 'val' });
    expect(lastWs?.send).toHaveBeenCalledWith(expect.stringContaining('"result":{"content":[{"type":"text","text":"Success"}]'));
  });

  it('should handle missing tool errors', async () => {
    service.init();
    await new Promise(r => setTimeout(r, 10));
    if (lastWs && lastWs.onopen) lastWs.onopen();

    const callRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 'err-1',
      method: 'tools/call',
      params: { name: 'unknown-tool' }
    });

    if (lastWs && lastWs.onmessage) lastWs.onmessage({ data: callRequest });

    expect(lastWs?.send).toHaveBeenCalledWith(expect.stringContaining('"error":{"code":-32601'));
  });
});
