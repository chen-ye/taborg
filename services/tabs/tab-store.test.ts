import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  get: vi.fn().mockResolvedValue({ windowId: 1 }),
};

describe('TabStore', () => {
  let tabStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeBrowser.reset();

    // Force patch listeners
    const tabs = fakeBrowser.tabs as any;
    tabs.onMoved = mockListeners;
    tabs.onAttached = mockListeners;
    tabs.onDetached = mockListeners;

    const windows = fakeBrowser.windows as any;
    windows.onFocusChanged = mockListeners;

    // Add missing mocks to fakeBrowser.tabs
    (fakeBrowser.tabs as any).group = vi.fn().mockResolvedValue(1);
    (fakeBrowser.tabs as any).move = vi.fn().mockResolvedValue(undefined);

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
      identity: {
        getProfileUserInfo: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      },
    };

    // Create a window so chrome.windows.getCurrent() works
    await fakeBrowser.windows.create({ focused: true });

    vi.resetModules();
    const module = await import('./tab-store');
    tabStore = module.tabStore;

    // Wait for init
    let retries = 0;
    while (tabStore.isInitializing.get() && retries < 50) {
      await new Promise((r) => setTimeout(r, 10));
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

    const tabs = fakeBrowser.tabs as any;
    tabs.onMoved = mockListeners;
    tabs.onAttached = mockListeners;
    tabs.onDetached = mockListeners;
    const windows = fakeBrowser.windows as any;
    windows.onFocusChanged = mockListeners;

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
    };

    await fakeBrowser.windows.create({ focused: true });
    // Use normalized URL (with trailing slash)
    await fakeBrowser.storage.local.set({
      'tab-suggestions': { 'https://test.com/': ['Group A'] },
    });

    const mod = await import('./tab-store');
    const store = mod.tabStore;

    let retries = 0;
    while (store.isInitializing.get() && retries < 50) {
      await new Promise((r) => setTimeout(r, 10));
      retries++;
    }

    expect(store.suggestionsUrlMap.get('https://test.com/')).toEqual(['Group A']);
  });

  it('should toggle tab selection', async () => {
    const windows = await fakeBrowser.windows.getAll();
    const window = windows[0];

    const mockTab = {
      id: 123,
      windowId: window.id,
      url: 'https://google.com/',
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
    await tabStore.fetchAll();

    const ids = new Set([mockTab.id]);
    tabStore.setSelectedTabs(ids);

    expect(tabStore.selectedTabIds.has(mockTab.id)).toBe(true);
    expect(tabStore.selectedTabIds.size).toBe(1);
  });

  it('should move tab to window', async () => {
    const moveSpy = vi.spyOn(fakeBrowser.tabs, 'move').mockResolvedValue(undefined as any);
    await tabStore.moveTabToWindow(1, 2);
    expect(moveSpy).toHaveBeenCalledWith([1], { windowId: 2, index: -1 });
  });

  it('should move group to window', async () => {
    const moveSpy = vi.spyOn(mockTabGroups, 'move').mockResolvedValue(undefined as any);
    await tabStore.moveGroupToWindow(10, 2);
    expect(moveSpy).toHaveBeenCalledWith(10, { windowId: 2, index: -1 });
  });

  it('should merge groups', async () => {
    const sourceGroupId = 10;
    const targetGroupId = 20;

    vi.spyOn(tabStore, 'findGroup').mockReturnValue({
      id: sourceGroupId,
      tabs: [{ id: 101 }, { id: 102 }],
    } as any);

    const groupSpy = vi.spyOn(fakeBrowser.tabs, 'group').mockResolvedValue(undefined as any);
    vi.spyOn(mockTabGroups, 'get').mockResolvedValue({ id: targetGroupId, windowId: 1 });
    vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue({ id: 101, windowId: 1 } as any);

    await tabStore.mergeGroups(sourceGroupId, targetGroupId);

    expect(groupSpy).toHaveBeenCalledWith({
      tabIds: [101, 102],
      groupId: targetGroupId,
    });
  });

  it('should return tabs without suggestions', async () => {
    vi.resetModules();
    fakeBrowser.reset();

    const tabs = fakeBrowser.tabs as any;
    tabs.onMoved = mockListeners;
    tabs.onAttached = mockListeners;
    tabs.onDetached = mockListeners;
    const windows = fakeBrowser.windows as any;
    windows.onFocusChanged = mockListeners;

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
    };

    await fakeBrowser.windows.create({ focused: true });

    const tabWithSuggestion = {
      id: 101,
      windowId: 1,
      url: 'https://suggested.com/',
      title: 'Suggested',
      active: false,
      groupId: -1,
      index: 0,
    };

    const tabWithoutSuggestion = {
      id: 102,
      windowId: 1,
      url: 'https://unsuggested.com/',
      title: 'Unsuggested',
      active: true,
      groupId: -1,
      index: 1,
    };

    (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([tabWithSuggestion, tabWithoutSuggestion]);

    await fakeBrowser.storage.local.set({
      'tab-suggestions': { 'https://suggested.com/': ['Group A'] },
    });

    const mod = await import('./tab-store');
    const store = mod.tabStore;

    let retries = 0;
    while (store.isInitializing.get() && retries < 50) {
      await new Promise((r) => setTimeout(r, 10));
      retries++;
    }

    await store.fetchAll();

    const result = store.getTabsWithoutSuggestions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(102);
    expect(result[0].url).toBe('https://unsuggested.com/');
  });

  it('should select duplicate tabs', async () => {
    const tab1 = { id: 101, url: 'https://dup.com/', windowId: 1, groupId: -1 };
    const tab2 = { id: 102, url: 'https://dup.com/', windowId: 1, groupId: -1 };
    const tab3 = { id: 103, url: 'https://unique.com/', windowId: 1, groupId: -1 };

    tabStore.windows = [
      {
        id: 1,
        tabs: [tab1, tab2, tab3],
        groups: [],
      },
    ] as any;

    tabStore.selectDuplicateTabs();

    expect(tabStore.selectedTabIds.has(101)).toBe(true);
    expect(tabStore.selectedTabIds.has(102)).toBe(true);
    expect(tabStore.selectedTabIds.has(103)).toBe(false);
  });

  it('should identify similar tabs by domain', async () => {
    const activeTab = { id: 1, title: 'Google Search', url: 'https://google.com/search', active: true, windowId: 1, groupId: -1 };
    const similarTab = { id: 2, title: 'Google Mail', url: 'https://google.com/mail', windowId: 1, groupId: -1 };
    const diffTab = { id: 3, title: 'Yahoo', url: 'https://yahoo.com/', windowId: 1, groupId: -1 };

    tabStore.windows = [
      {
        id: 1,
        focused: true,
        tabs: [activeTab, similarTab, diffTab],
        groups: [],
      },
    ] as any;

    const similar = tabStore.similarTabs.get();
    const similarIds = similar.map((t: any) => t.id);
    expect(similarIds).toContain(2);
    expect(similarIds).not.toContain(3);
    expect(similarIds).not.toContain(1);
  });

  it('should identify similar tabs by fuzzy title match', async () => {
    const activeTab = { id: 1, title: 'React Documentation', url: 'https://react.dev/', active: true, windowId: 1, groupId: -1 };
    const similarTab = { id: 2, title: 'React Hooks', url: 'https://medium.com/react-hooks', windowId: 1, groupId: -1 };
    const diffTab = { id: 3, title: 'Angular', url: 'https://angular.io/', windowId: 1, groupId: -1 };

    tabStore.windows = [
      {
        id: 1,
        focused: true,
        tabs: [activeTab, similarTab, diffTab],
        groups: [],
      },
    ] as any;

    const similar = tabStore.similarTabs.get();
    const similarIds = similar.map((t: any) => t.id);
    expect(similarIds).toContain(2);
    expect(similarIds).not.toContain(3);
  });

  it('should persist selectedTabIds to storage', async () => {
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    
    tabStore.setSelectedTabs(new Set([1, 2, 3]));
    
    expect(tabStore.selectedTabIds.has(1)).toBe(true);
    // saveSelection has a 500ms debounce
    await new Promise(r => setTimeout(r, 600));
    expect(setSpy).toHaveBeenCalledWith({ 'selected-tabs': [1, 2, 3] });
  });

  it('should persist windowNames to storage', async () => {
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    
    await tabStore.setWindowName(1, 'Work');
    
    expect(tabStore.windowNames.get(1)).toBe('Work');
    expect(setSpy).toHaveBeenCalledWith({ 'window-names': { '1': 'Work' } });
  });

  it('should handle grouping tabs that are already in a group', async () => {
    const tabId = 101;
    const initialGroupId = 10;
    const targetGroupId = 20;

    vi.spyOn(fakeBrowser.tabs, 'group').mockResolvedValue(targetGroupId);
    vi.spyOn(fakeBrowser.tabs, 'get').mockResolvedValue({ id: tabId, windowId: 1, groupId: initialGroupId } as any);
    vi.spyOn(mockTabGroups, 'get').mockResolvedValue({ id: targetGroupId, windowId: 1 });

    await tabStore.moveTabToGroup(tabId, targetGroupId);

    expect(fakeBrowser.tabs.group).toHaveBeenCalledWith({
      tabIds: [tabId],
      groupId: targetGroupId,
    });
  });

  it('should persist collapsedWindowIds to storage', async () => {
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    
    await tabStore.setWindowCollapsed(1, true);
    
    expect(tabStore.collapsedWindowIds.has(1)).toBe(true);
    expect(setSpy).toHaveBeenCalledWith({ 'collapsed-windows': [1] });
  });
});