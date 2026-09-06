import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { main } from '../entrypoints/background';
import { llmManager } from '../services/ai/llm-manager.js';

// Mock llmManager
vi.mock('../services/ai/llm-manager.js', () => ({
  llmManager: {
    categorizeTabs: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  },
}));

describe('Background Script', () => {
  // Mock listeners
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};

  const createMockListener = (name: string) => ({
    addListener: vi.fn((cb) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(cb);
    }),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();

    // Reset listeners storage
    for (const key in listeners) delete listeners[key];

    // Setup mocks
    (globalThis as any).chrome = {
      ...fakeBrowser,
      runtime: {
        ...fakeBrowser.runtime,
        onStartup: createMockListener('onStartup'),
        onInstalled: createMockListener('onInstalled'),
        onMessage: createMockListener('onMessage'),
        getContexts: vi.fn().mockResolvedValue([]),
        getManifest: () => ({ version: '1.0.0' }),
      },
      tabs: {
        ...fakeBrowser.tabs,
        onUpdated: createMockListener('onUpdated'),
        onCreated: createMockListener('onCreated'),
        onRemoved: createMockListener('onRemoved'),
        get: vi.fn(), // Mock get
        query: vi.fn().mockResolvedValue([]), // Mock query
      },
      offscreen: {
        createDocument: vi.fn(),
        Reason: { DOM_PARSER: 'DOM_PARSER' },
      },
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      },
      action: {
        setIcon: vi.fn(),
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      tabGroups: {
        query: vi.fn().mockResolvedValue([]),
      },
      identity: {
        getProfileUserInfo: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      },
    };

    (globalThis as any).chrome.storage.sync.get = vi.fn().mockResolvedValue({
      'active-llm-provider': 'gemini',
      'llm-fallback-enabled': true,
      'auto-categorization-mode': 'initial',
      geminiApiKey: 'test-key',
    } as any);

    // Mock WebSocket
    (globalThis as any).WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      onopen = null;
      onclose = null;
      onerror = null;
      onmessage = null;
      send = vi.fn();
      close = vi.fn();
    };
  });

  const triggerOnCreated = (tab: any) => {
    listeners.onCreated?.forEach((cb) => {
      cb(tab);
    });
  };

  const triggerOnUpdated = async (tabId: number, changeInfo: any, tab: any) => {
    // onUpdated is async in background.ts
    await Promise.all(listeners.onUpdated?.map((cb) => cb(tabId, changeInfo, tab)) || []);
  };

  it('should trigger suggest for tab with openerTabId (link click)', async () => {
    main(); // Register listeners

    const tabId = 101;
    const tab = {
      id: tabId,
      url: 'https://google.com',
      title: 'Google',
      openerTabId: 99, // Opened from another tab
    };

    vi.mocked(chrome.tabs.get).mockResolvedValue(tab as any);

    // Use implementation to call onProgress
    (llmManager.categorizeTabs as any).mockImplementation(async (tabs: any, groups: any, onProgress: any) => {
      const result = new Map([[tabId, ['Search']]]);
      if (onProgress) await onProgress(result);
      return result;
    });

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    // Wait until storage is updated
    await vi.waitUntil(
      async () => {
        const stored = await fakeBrowser.storage.local.get('tab-suggestions');
        return !!stored['tab-suggestions']?.['https://google.com/'];
      },
      { timeout: 1000, interval: 10 },
    );

    expect(llmManager.categorizeTabs).toHaveBeenCalled();
    const stored = await fakeBrowser.storage.local.get('tab-suggestions');
    // Normalized URL in storage
    expect(stored['tab-suggestions']['https://google.com/']).toEqual(['Search']);
  });

  it('should NOT trigger suggest for stand-alone new tab (direct navigation without new tab state tracked)', async () => {
    main();

    const tabId = 102;
    const tab = {
      id: tabId,
      url: 'https://example.com',
      openerTabId: undefined,
    };

    vi.mocked(chrome.tabs.get).mockResolvedValue(tab as any);

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    expect(llmManager.categorizeTabs).not.toHaveBeenCalled();
  });

  it('should trigger suggest for tab navigating away from new tab page', async () => {
    main();

    const tabId = 103;

    // 1. Tab created as new tab
    triggerOnCreated({ id: tabId, url: 'chrome://newtab/' });

    // 2. Tab navigates to http url
    const tab = {
      id: tabId,
      url: 'https://news.com',
      title: 'News',
    };

    vi.mocked(chrome.tabs.get).mockResolvedValue(tab as any);

    (llmManager.categorizeTabs as any).mockImplementation(async (tabs: any, groups: any, onProgress: any) => {
      const result = new Map([[tabId, ['News']]]);
      if (onProgress) await onProgress(result);
      return result;
    });

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    await vi.waitUntil(
      async () => {
        const stored = await fakeBrowser.storage.local.get('tab-suggestions');
        return !!stored['tab-suggestions']?.['https://news.com/'];
      },
      { timeout: 1000, interval: 10 },
    );

    expect(llmManager.categorizeTabs).toHaveBeenCalled();
    const stored = await fakeBrowser.storage.local.get('tab-suggestions');
    expect(stored['tab-suggestions']['https://news.com/']).toEqual(['News']);
  });

  it('should handle navigation back to new tab and then to a site', async () => {
    main();
    const tabId = 104;

    // 1. Tab created normally (no suggestion)
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: tabId, url: 'https://a.com' } as any);
    await triggerOnUpdated(tabId, { status: 'complete' }, { id: tabId, url: 'https://a.com' });
    expect(llmManager.categorizeTabs).not.toHaveBeenCalled();

    // 2. Navigate to new tab
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: tabId, url: 'chrome://newtab/' } as any);
    await triggerOnUpdated(tabId, { url: 'chrome://newtab/' }, { id: tabId, url: 'chrome://newtab/' });

    // 3. Navigate to new site
    const tab = {
      id: tabId,
      url: 'https://b.com',
      title: 'B',
    };
    vi.mocked(chrome.tabs.get).mockResolvedValue(tab as any);

    (llmManager.categorizeTabs as any).mockImplementation(async (tabs: any, groups: any, onProgress: any) => {
      const result = new Map([[tabId, ['B']]]);
      if (onProgress) await onProgress(result);
      return result;
    });

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    await vi.waitUntil(
      async () => {
        const calls = (llmManager.categorizeTabs as any).mock.calls;
        if (calls.length === 0) return false;
        // Also matching specific url if multiple calls happened? Not needed here.
        return true;
      },
      { timeout: 1000, interval: 10 },
    );

    expect(llmManager.categorizeTabs).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ url: 'https://b.com' })]),
      expect.anything(),
      expect.anything(), // onProgress callback
    );
  });
});
