import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TabStore } from '../services/tab-store.js';

describe('TabStore', () => {
  let store: TabStore;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();

    // Mock global chrome
    (globalThis as any).chrome = {
      ...fakeBrowser,
      windows: {
        ...fakeBrowser.windows,
        getAll: vi.fn(),
        getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
        onFocusChanged: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      tabs: {
        ...fakeBrowser.tabs,
        query: vi.fn(),
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onActivated: { addListener: vi.fn() },
        onMoved: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onAttached: { addListener: vi.fn() },
        onDetached: { addListener: vi.fn() },
        get: vi.fn(),
        move: vi.fn(),
      },
      tabGroups: {
        query: vi.fn().mockResolvedValue([]),
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onMoved: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
    };
  });

  const setupStore = async (tabs: any[]) => {
    // Mock returns
    (chrome.windows.getAll as any).mockResolvedValue([{ id: 1, focused: true }]);
    (chrome.tabs.query as any).mockResolvedValue(tabs);
    (chrome.windows.getCurrent as any).mockReturnValue(Promise.resolve({ id: 1 }));

    store = new TabStore();
    // Wait for init
    await new Promise((r) => setTimeout(r, 0));
    await store.fetchAll();
  };

  it('should identify similar tabs by domain', async () => {
    const tabs = [
      { id: 1, title: 'Google Search', url: 'https://google.com/search', active: true, windowId: 1 },
      { id: 2, title: 'Google Mail', url: 'https://google.com/mail', windowId: 1 }, // Same domain
      { id: 3, title: 'Yahoo', url: 'https://yahoo.com', windowId: 1 }, // Different domain
    ];

    await setupStore(tabs);

    const similar = store.similarTabs.get();
    expect(similar.map((t: any) => t.id)).toContain(2);
    expect(similar.map((t: any) => t.id)).not.toContain(3);
    expect(similar.map((t: any) => t.id)).not.toContain(1); // Exclude self
  });

  it('should identify similar tabs by fuzzy title match', async () => {
    const tabs = [
      { id: 1, title: 'React Documentation', url: 'https://react.dev', active: true, windowId: 1 },
      { id: 2, title: 'React Hooks', url: 'https://medium.com/react-hooks', windowId: 1 }, // Similar title, diff domain
      { id: 3, title: 'Angular', url: 'https://angular.io', windowId: 1 }, // Different
    ];

    await setupStore(tabs);

    const similar = store.similarTabs.get();
    expect(similar.map((t: any) => t.id)).toContain(2);
    expect(similar.map((t: any) => t.id)).not.toContain(3);
  });

  it('should deduplicate tabs that match both domain and title', async () => {
    const tabs = [
      { id: 1, title: 'React Documentation', url: 'https://react.dev/docs', active: true, windowId: 1 },
      { id: 2, title: 'React Blog', url: 'https://react.dev/blog', windowId: 1 }, // Matches both
    ];

    await setupStore(tabs);

    const similar = store.similarTabs.get();
    expect(similar.length).toBe(1);
    expect(similar[0].id).toBe(2);
  });

  it('should move tab after active tab', async () => {
    const tabs = [
      { id: 1, title: 'Active Tab', url: 'https://example.com', active: true, windowId: 1, index: 5 },
      { id: 2, title: 'Other Tab', url: 'https://example.com/other', windowId: 1, index: 10 },
    ];
    await setupStore(tabs);

    // Mock chrome.tabs.get needed for the operation
    (chrome.tabs.get as any).mockResolvedValue(tabs[0]);
    // Mock chrome.tabs.move
    (chrome.tabs.move as any).mockResolvedValue({});

    await store.moveTabAfterActive(2);

    expect(chrome.tabs.move).toHaveBeenCalledWith([2], { windowId: 1, index: 6 });
  });
});
