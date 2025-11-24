import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Mock chrome.tabGroups and other missing listeners
const mockListeners = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn(),
};

const mockTabGroups = {
  query: vi.fn().mockResolvedValue([]),
  onCreated: mockListeners,
  onUpdated: mockListeners,
  onMoved: mockListeners,
  onRemoved: mockListeners,
  update: vi.fn().mockResolvedValue(undefined),
};

describe('TabStore', () => {
  let tabStore: any;

  beforeEach(async () => {
    fakeBrowser.reset();

    // Force patch listeners
    const tabs = (fakeBrowser.tabs as any);
    tabs.onMoved = mockListeners;
    tabs.onAttached = mockListeners;
    tabs.onDetached = mockListeners;

    const windows = (fakeBrowser.windows as any);
    windows.onFocusChanged = mockListeners;

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
    };

    // Create a window so chrome.windows.getCurrent() works
    await fakeBrowser.windows.create({ focused: true });

    vi.resetModules();
    const module = await import('./tab-store');
    tabStore = module.tabStore;

    // Wait for init
    let retries = 0;
    while (tabStore.isInitializing.get() && retries < 50) {
      await new Promise(r => setTimeout(r, 10));
      retries++;
    }
  });

  it('should initialize with default values', async () => {
    const windows = [...tabStore.windows];
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].id).toBeDefined();
    expect(tabStore.selectedTabIds.size).toBe(0);
  });

  it('should load suggestions from storage', async () => {
    vi.resetModules();
    fakeBrowser.reset();

    const tabs = (fakeBrowser.tabs as any);
    tabs.onMoved = mockListeners;
    tabs.onAttached = mockListeners;
    tabs.onDetached = mockListeners;
    const windows = (fakeBrowser.windows as any);
    windows.onFocusChanged = mockListeners;

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
    };

    await fakeBrowser.windows.create({ focused: true });
    await fakeBrowser.storage.local.set({
      'tab-suggestions': { 'https://test.com': ['Group A'] }
    });

    const mod = await import('./tab-store');
    const store = mod.tabStore;

    let retries = 0;
    while (store.isInitializing.get() && retries < 50) {
      await new Promise(r => setTimeout(r, 10));
      retries++;
    }

    expect(store.suggestionsUrlMap.get('https://test.com')).toEqual(['Group A']);
  });

  it('should toggle tab selection', async () => {
    const windows = await fakeBrowser.windows.getAll();
    const window = windows[0];

    // Mock chrome.tabs.query because fakeBrowser seems to have issues returning created tabs in query
    const mockTab = {
        id: 123,
        windowId: window.id,
        url: 'https://google.com',
        title: 'Google',
        active: true,
        groupId: -1,
        pinned: false,
        highlighted: false,
        incognito: false,
        index: 0,
        selected: false,
        discarded: false,
        autoDiscardable: false,
    };

    (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([mockTab]);

    // Force refresh
    await tabStore.fetchAll();

    const storeWindows = [...tabStore.windows];
    const storedWindow = storeWindows.find((w: any) => w.id === window.id);
    expect(storedWindow).toBeDefined();

    const storedTab = storedWindow.tabs.find((t: any) => t.id === mockTab.id);
    expect(storedTab).toBeDefined();

    const ids = new Set([mockTab.id]);
    tabStore.setSelectedTabs(ids);

    expect(tabStore.selectedTabIds.has(mockTab.id)).toBe(true);
    expect(tabStore.selectedTabIds.size).toBe(1);
  });
});
