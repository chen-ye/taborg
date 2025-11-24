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
  move: vi.fn().mockResolvedValue(undefined),
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

    // Add missing mocks to fakeBrowser.tabs
    (fakeBrowser.tabs as any).group = vi.fn().mockResolvedValue(1);
    (fakeBrowser.tabs as any).move = vi.fn().mockResolvedValue(undefined);

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

  it('should move tab to window', async () => {
    const moveSpy = vi.spyOn(fakeBrowser.tabs, 'move').mockResolvedValue(undefined as any);
    await tabStore.moveTabToWindow(1, 2);
    expect(moveSpy).toHaveBeenCalledWith(1, { windowId: 2, index: -1 });
  });

  it('should move group to window', async () => {
    const moveSpy = vi.spyOn(mockTabGroups, 'move').mockResolvedValue(undefined as any);
    await tabStore.moveGroupToWindow(10, 2);
    expect(moveSpy).toHaveBeenCalledWith(10, { windowId: 2, index: -1 });
  });

  it('should merge groups', async () => {
    // Setup source group with tabs
    const windows = await fakeBrowser.windows.getAll();
    const sourceGroupId = 10;
    const targetGroupId = 20;

    // Create a group in the store manually or mock it
    // Using simple mock since we just need findGroup to return something
    vi.spyOn(tabStore, 'findGroup').mockReturnValue({
      id: sourceGroupId,
      tabs: [{ id: 101 }, { id: 102 }]
    } as any);

    const groupSpy = vi.spyOn(fakeBrowser.tabs, 'group').mockResolvedValue(undefined as any);

    await tabStore.mergeGroups(sourceGroupId, targetGroupId);

    expect(groupSpy).toHaveBeenCalledWith({
      tabIds: [101, 102],
      groupId: targetGroupId
    });
  });

  it('should merge groups across windows', async () => {
    // Setup source group in window 1, target in window 2
    const sourceGroupId = 10;
    const targetGroupId = 20;

    const findGroupSpy = vi.spyOn(tabStore, 'findGroup');
    findGroupSpy.mockReturnValueOnce({ id: sourceGroupId, windowId: 1, tabs: [{ id: 101 }] } as any);
    findGroupSpy.mockReturnValueOnce({ id: targetGroupId, windowId: 2, tabs: [] } as any);

    const moveGroupSpy = vi.spyOn(mockTabGroups, 'move').mockResolvedValue(undefined as any);
    const groupSpy = vi.spyOn(fakeBrowser.tabs, 'group').mockResolvedValue(undefined as any);

    await tabStore.mergeGroups(sourceGroupId, targetGroupId);

    expect(moveGroupSpy).toHaveBeenCalledWith(sourceGroupId, { windowId: 2, index: -1 });
    expect(groupSpy).toHaveBeenCalledWith({
      tabIds: [101],
      groupId: targetGroupId
    });
  });

  it('should merge windows', async () => {
    const sourceWindowId = 1;
    const targetWindowId = 2;

    // Mock windows in store
    tabStore.windows = [
      {
        id: sourceWindowId,
        groups: [{ id: 10, tabs: [] }],
        tabs: [{ id: 101 }, { id: 102 }]
      }
    ] as any;

    const groupMoveSpy = vi.spyOn(mockTabGroups, 'move').mockResolvedValue(undefined as any);
    const tabMoveSpy = vi.spyOn(fakeBrowser.tabs, 'move').mockResolvedValue(undefined as any);

    await tabStore.mergeWindows(sourceWindowId, targetWindowId);

    expect(groupMoveSpy).toHaveBeenCalledWith(10, { windowId: targetWindowId, index: -1 });
    expect(tabMoveSpy).toHaveBeenCalledWith([101, 102], { windowId: targetWindowId, index: -1 });
  });
});
