import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Mock listeners
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
  get: vi.fn(),
};

describe('TabStore - Follow Me & Active Tab Logic', () => {
  let tabStore: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeBrowser.reset();

    // Setup mocks
    (fakeBrowser.tabs as any).onMoved = mockListeners;
    (fakeBrowser.tabs as any).onAttached = mockListeners;
    (fakeBrowser.tabs as any).onDetached = mockListeners;
    (fakeBrowser.windows as any).onFocusChanged = mockListeners;

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabGroups: mockTabGroups,
      identity: {
        getProfileUserInfo: vi.fn().mockResolvedValue({ email: 'test@example.com' }),
      },
    };

    // Reset modules to get a fresh TabStore instance
    vi.resetModules();
    const module = await import('./tab-store');
    tabStore = module.tabStore;
  });

  it('should prioritize the active tab in the current window (sidepanel host)', async () => {
    // Setup: Two windows
    // Window 1: ID 100, Focused: FALSE. Has Tab 1 (Active)
    // Window 2: ID 200, Focused: TRUE. Has Tab 2 (Active)

    // In a real scenario, the sidepanel knows its window ID via chrome.windows.getCurrent()
    // We simulate this by setting tabStore.currentWindowId

    const window1 = {
      id: 100,
      focused: false,
      tabs: [{ id: 1, windowId: 100, active: true, title: 'Tab 1', url: 'http://a.com' }],
      groups: [],
    };

    const window2 = {
      id: 200,
      focused: true, // User is interacting with this window
      tabs: [{ id: 2, windowId: 200, active: true, title: 'Tab 2', url: 'http://b.com' }],
      groups: [],
    };

    // Mock browser service / storage to return these windows
    (globalThis as any).chrome.windows.getAll = vi.fn().mockResolvedValue([window1, window2]);
    (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([...window1.tabs, ...window2.tabs]);
    (globalThis as any).chrome.tabGroups.query = vi.fn().mockResolvedValue([]);
    (globalThis as any).chrome.storage.local.get = vi.fn().mockResolvedValue({});

    // 1. Initialize logic
    // We cannot easily mock chrome.windows.getCurrent during module load because it happens in constructor/init
    // But we can manually set the signal after init for testing the computed logic.

    // Let's rely on fetchAll populating the windows signal
    await tabStore.fetchAll();

    // Verify windows are loaded
    expect(tabStore.windows.length).toBe(2);

    // CASE 1: Sidepanel is in Window 1 (Background Window)
    tabStore.currentWindowId.set(100);

    // Even though Window 2 is globally focused, activeTabId should point to Window 1's active tab
    expect(tabStore.activeTabId.get()).toBe(1);

    // CASE 2: Sidepanel is in Window 2 (Foreground Window)
    tabStore.currentWindowId.set(200);
    expect(tabStore.activeTabId.get()).toBe(2);

    // CASE 3: Valid window ID but no window found (e.g. closed) -> undefined
    tabStore.currentWindowId.set(999);
    expect(tabStore.activeTabId.get()).toBeUndefined();
  });

  it('has no effect if there is no currentWindowId', async () => {
    // This behavior is preserved for when the sidepanel is NOT bound to a window (e.g. extension page tab)
    const window1 = {
      id: 100,
      focused: true, // Globally focused
      tabs: [{ id: 1, windowId: 100, active: true, title: 'Tab 1', url: 'http://a.com' }],
      groups: [],
    };

    const window2 = {
      id: 200,
      focused: false,
      tabs: [{ id: 2, windowId: 200, active: true, title: 'Tab 2', url: 'http://b.com' }],
      groups: [],
    };

    (globalThis as any).chrome.windows.getAll = vi.fn().mockResolvedValue([window1, window2]);
    (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([...window1.tabs, ...window2.tabs]);
    (globalThis as any).chrome.tabGroups.query = vi.fn().mockResolvedValue([]);

    await tabStore.fetchAll();

    // Simulate undefined currentWindow (e.g. detached or init state)
    tabStore.currentWindowId.set(undefined);

    // Should NOT pick the focused window (Window 1)
    expect(tabStore.activeTabId.get()).toBeUndefined();
  });

  it('should find active tab inside a group in the current window', async () => {
    const group = {
      id: 10,
      windowId: 100,
      collapsed: false,
      color: 'blue',
      title: 'Group 1',
    };

    // Tab inside group is active
    const tabInGroup = { id: 5, windowId: 100, groupId: 10, active: true, title: 'GTab', url: 'http://c.com' };
    const tabUngrouped = { id: 6, windowId: 100, groupId: -1, active: false, title: 'Tab', url: 'http://d.com' };

    const window1 = {
      id: 100,
      focused: true,
      tabs: [tabUngrouped], // browserService separates grouped tabs usually, tabStore recombines
      // Mocking capabilities of browserService.getWindows/Tabs/Groups is slightly complex due to recombination logic in fetchAll.
      // Let's mock the raw data returned to fetchAll
    };

    // BrowserService mocks
    (globalThis as any).chrome.windows.getAll = vi.fn().mockResolvedValue([window1]);
    (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([tabInGroup, tabUngrouped]);
    (globalThis as any).chrome.tabGroups.query = vi.fn().mockResolvedValue([group]);

    await tabStore.fetchAll();
    tabStore.currentWindowId.set(100);

    expect(tabStore.activeTabId.get()).toBe(5);
  });
});
