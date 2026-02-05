import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { main } from '../entrypoints/background';
import { geminiService } from '../services/ai/gemini';

// Mock geminiService
vi.mock('../services/ai/gemini', () => ({
  geminiService: {
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

    (geminiService.categorizeTabs as any).mockResolvedValue(new Map([[tabId, ['Search']]]));

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    expect(geminiService.categorizeTabs).toHaveBeenCalled();
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

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);
    expect(geminiService.categorizeTabs).not.toHaveBeenCalled();
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

    (geminiService.categorizeTabs as any).mockResolvedValue(new Map([[tabId, ['News']]]));

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    expect(geminiService.categorizeTabs).toHaveBeenCalled();
    const stored = await fakeBrowser.storage.local.get('tab-suggestions');
    expect(stored['tab-suggestions']['https://news.com/']).toEqual(['News']);
  });

  it('should handle navigation back to new tab and then to a site', async () => {
    main();
    const tabId = 104;

    // 1. Tab created normally (no suggestion)
    await triggerOnUpdated(tabId, { status: 'complete' }, { id: tabId, url: 'https://a.com' });
    expect(geminiService.categorizeTabs).not.toHaveBeenCalled();

    // 2. Navigate to new tab
    await triggerOnUpdated(tabId, { url: 'chrome://newtab/' }, { id: tabId, url: 'chrome://newtab/' });

    // 3. Navigate to new site
    const tab = {
      id: tabId,
      url: 'https://b.com',
      title: 'B',
    };
    (geminiService.categorizeTabs as any).mockResolvedValue(new Map([[tabId, ['B']]]));

    await triggerOnUpdated(tabId, { status: 'complete' }, tab);

    expect(geminiService.categorizeTabs).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ url: 'https://b.com' })]),
      expect.anything(),
      undefined,
    );
  });
});