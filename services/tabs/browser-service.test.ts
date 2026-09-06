import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { StorageKeys } from '../../utils/storage-keys';
import { BrowserService, getRealUrl } from './browser-service';

describe('BrowserService - firstAccessed', () => {
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
    for (const key in listeners) delete listeners[key];

    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabs: {
        ...fakeBrowser.tabs,
        onCreated: createMockListener('onCreated'),
        onRemoved: createMockListener('onRemoved'),
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
      },
    };
  });

  it('should track firstAccessed timestamp when tab is created or discovered', async () => {
    // 1. Initial setup - one tab exists in browser
    const existingTab = {
      id: 101,
      url: 'https://example.com',
      title: 'Example',
      windowId: 1,
      groupId: -1,
      index: 0,
      active: true,
    };
    (chrome.tabs as any).query.mockResolvedValue([existingTab]);

    // Create a new instance to run constructor initialization
    const service = new BrowserService();

    // Verify firstAccessed populated
    const tabs = await service.getTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].firstAccessed).toBeDefined();
    expect(typeof tabs[0].firstAccessed).toBe('number');

    const firstAccessedVal = tabs[0].firstAccessed;

    // 2. Tab is created
    const onCreatedListener = listeners.onCreated?.[0];
    expect(onCreatedListener).toBeDefined();

    const newTab = {
      id: 102,
      url: 'https://google.com',
      title: 'Google',
      windowId: 1,
      groupId: -1,
      index: 1,
      active: false,
    };

    // Mock get/query to return both tabs
    (chrome.tabs as any).query.mockResolvedValue([existingTab, newTab]);
    (chrome.tabs as any).get.mockImplementation(async (id: number) => {
      if (id === 101) return existingTab;
      if (id === 102) return newTab;
      throw new Error('Not found');
    });

    // Simulate tab creation event
    await onCreatedListener(newTab);

    const updatedTabs = await service.getTabs();
    expect(updatedTabs).toHaveLength(2);

    const tab101 = updatedTabs.find((t) => t.id === 101);
    const tab102 = updatedTabs.find((t) => t.id === 102);

    expect(tab101?.firstAccessed).toBe(firstAccessedVal);
    expect(tab102?.firstAccessed).toBeDefined();
    expect(tab102?.firstAccessed).toBeGreaterThanOrEqual(firstAccessedVal as number);

    // 3. Tab is removed
    const onRemovedListener = listeners.onRemoved?.[0];
    expect(onRemovedListener).toBeDefined();

    // Mock query to return only existing tab now
    (chrome.tabs as any).query.mockResolvedValue([existingTab]);

    // Simulate removal event
    await onRemovedListener(102);

    const finalTabs = await service.getTabs();
    expect(finalTabs).toHaveLength(1);
    expect(finalTabs[0].id).toBe(101);

    // Verify removed tab is cleaned from storage
    const stored = await fakeBrowser.storage.local.get(StorageKeys.Local.FIRST_ACCESSED);
    const data = stored[StorageKeys.Local.FIRST_ACCESSED] || {};
    expect(data['102']).toBeUndefined();
    expect(data['101']).toBe(firstAccessedVal);
  });
});

describe('BrowserService - Tooling Enhancements', () => {
  let service: BrowserService;

  beforeEach(() => {
    fakeBrowser.reset();
    (globalThis as any).chrome = {
      ...fakeBrowser,
      tabs: {
        ...fakeBrowser.tabs,
        onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
        query: vi.fn(),
        get: vi.fn(),
      },
    };
    service = new BrowserService();
  });

  describe('getRealUrl / suspended URL decoding', () => {
    it('should decode suspended URLs from other extensions (e.g. Marvellous Suspender)', () => {
      const suspended =
        'chrome-extension://iaiomicjabeggjcfkbimgmglanimpnae/replaced/index.html?state=redirect&url=https%3A%2F%2Fgithub.com%2Fgoogle%2Fgemini';
      expect(getRealUrl(suspended)).toBe('https://github.com/google/gemini');
    });

    it('should leave normal URLs untouched', () => {
      const normal = 'https://github.com/google/gemini';
      expect(getRealUrl(normal)).toBe('https://github.com/google/gemini');
    });
  });

  describe('getTabs advanced filters', () => {
    it('should support ungroupedOnly filter', async () => {
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://a.com', groupId: -1 },
        { id: 2, title: 'Tab 2', url: 'https://b.com', groupId: 10 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const ungrouped = await service.getTabs({ ungroupedOnly: true });
      expect(ungrouped).toHaveLength(1);
      expect(ungrouped[0].id).toBe(1);
    });

    it('should support excludeGroupIds filter', async () => {
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://a.com', groupId: -1 },
        { id: 2, title: 'Tab 2', url: 'https://b.com', groupId: 10 },
        { id: 3, title: 'Tab 3', url: 'https://c.com', groupId: 11 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const filtered = await service.getTabs({ excludeGroupIds: [10] });
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.id)).toEqual([1, 3]);
    });

    it('should support substring matching in titleQuery and urlQuery', async () => {
      const tabs = [
        { id: 1, title: 'GitHub pull requests', url: 'https://github.com/pulls', groupId: -1 },
        { id: 2, title: 'Google Search', url: 'https://google.com', groupId: -1 },
        { id: 3, title: 'Vercel Dashboard', url: 'https://vercel.com', groupId: -1 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const githubTabs = await service.getTabs({ urlQuery: 'github' });
      expect(githubTabs).toHaveLength(1);
      expect(githubTabs[0].id).toBe(1);

      const searchTabs = await service.getTabs({ titleQuery: 'search' });
      expect(searchTabs).toHaveLength(1);
      expect(searchTabs[0].id).toBe(2);
    });

    it('should support glob pattern wildcard matching in titleQuery and urlQuery', async () => {
      const tabs = [
        { id: 1, title: 'GitHub PR #12', url: 'https://github.com/org/repo/pull/12', groupId: -1 },
        { id: 2, title: 'Google Analytics', url: 'https://analytics.google.com/dashboard', groupId: -1 },
        { id: 3, title: 'My GitHub Profile', url: 'https://github.com/my-profile', groupId: -1 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const repoTabs = await service.getTabs({ urlQuery: '*github.com/*/repo/*' });
      expect(repoTabs).toHaveLength(1);
      expect(repoTabs[0].id).toBe(1);

      const googleTabs = await service.getTabs({ titleQuery: 'Google*' });
      expect(googleTabs).toHaveLength(1);
      expect(googleTabs[0].id).toBe(2);
    });

    it('should support timestamp filters on lastAccessed and firstAccessed with fail-open logic', async () => {
      const tabs = [
        { id: 1, title: 'Old Tab', url: 'https://a.com', groupId: -1, lastAccessed: 1000 },
        { id: 2, title: 'New Tab', url: 'https://b.com', groupId: -1, lastAccessed: 2000 },
        { id: 3, title: 'No Timestamp Tab', url: 'https://c.com', groupId: -1 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const beforeTabs = await service.getTabs({ lastAccessedBefore: 1500 });
      expect(beforeTabs.map((t) => t.id).sort()).toEqual([1, 3]);

      const afterTabs = await service.getTabs({ lastAccessedAfter: 1500 });
      expect(afterTabs.map((t) => t.id).sort()).toEqual([2, 3]);
    });

    it('should map pinned state correctly in getTabs and getTab', async () => {
      const tabs = [
        { id: 1, title: 'Pinned Tab', url: 'https://pinned.com', groupId: -1, pinned: true },
        { id: 2, title: 'Unpinned Tab', url: 'https://unpinned.com', groupId: -1, pinned: false },
        { id: 3, title: 'Default Tab', url: 'https://default.com', groupId: -1 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);
      (chrome.tabs as any).get.mockImplementation(async (id: number) => tabs.find((t) => t.id === id));

      const result = await service.getTabs();
      expect(result).toHaveLength(3);
      expect(result[0].pinned).toBe(true);
      expect(result[1].pinned).toBe(false);
      expect(result[2].pinned).toBe(false);

      const singlePinned = await service.getTab(1);
      expect(singlePinned.pinned).toBe(true);

      const singleUnpinned = await service.getTab(2);
      expect(singleUnpinned.pinned).toBe(false);
    });

    it('should pass pinned filter to chrome.tabs.query', async () => {
      (chrome.tabs as any).query.mockResolvedValue([]);
      await service.getTabs({ pinned: true });
      expect((chrome.tabs as any).query).toHaveBeenCalledWith(expect.objectContaining({ pinned: true }));
    });
  });

  describe('getTabChains proximity and parent-child tracking', () => {
    it('should find physically adjacent ungrouped tabs in the same window within maxDistance', async () => {
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://a.com', windowId: 1, groupId: -1, index: 0 },
        { id: 2, title: 'Focal Tab', url: 'https://focal.com', windowId: 1, groupId: -1, index: 1 },
        { id: 3, title: 'Tab 3', url: 'https://c.com', windowId: 1, groupId: -1, index: 2 },
        { id: 4, title: 'Tab 4 (Far)', url: 'https://d.com', windowId: 1, groupId: -1, index: 5 },
        { id: 5, title: 'Tab 5 (Grouped)', url: 'https://e.com', windowId: 1, groupId: 10, index: 3 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const chains = await service.getTabChains([2], [], 2);
      expect(chains.map((t) => t.id)).toEqual([1, 3]);
    });

    it('should trace historical parent-child links via openerTabId', async () => {
      const tabs = [
        { id: 1, title: 'Parent', url: 'https://parent.com', windowId: 1, groupId: -1, index: 0 },
        { id: 2, title: 'Focal Tab', url: 'https://focal.com', windowId: 1, groupId: -1, index: 10, openerTabId: 1 },
        { id: 3, title: 'Child', url: 'https://child.com', windowId: 1, groupId: -1, index: 20, openerTabId: 2 },
      ];
      (chrome.tabs as any).query.mockResolvedValue(tabs);

      const chains = await service.getTabChains([2], [], 1);
      expect(chains.map((t) => t.id).sort()).toEqual([1, 3]);
    });
  });

  describe('getSummaryStatistics', () => {
    it('should compute count and age statistics by group and domain', async () => {
      const now = Date.now();
      const tabs = [
        { id: 1, title: 'GitHub PR', url: 'https://github.com/google/gemini', groupId: 10, lastAccessed: now - 5000 },
        { id: 2, title: 'GitHub Issue', url: 'https://github.com/google/wxt', groupId: 10, lastAccessed: now - 15000 },
        { id: 3, title: 'Google Search', url: 'https://google.com/search', groupId: -1, lastAccessed: now - 30000 },
      ];
      const groups = [{ id: 10, title: 'Development', color: 'blue', windowId: 1, collapsed: false }];

      (chrome.tabs as any).query.mockResolvedValue(tabs);
      (chrome as any).tabGroups = {
        query: vi.fn().mockResolvedValue(groups),
      };

      const stats = await service.getSummaryStatistics();
      expect(stats.totalTabs).toBe(3);

      // Verify group statistics
      expect(stats.byGroup).toHaveLength(2);

      const devGroup = stats.byGroup.find((g) => g.groupId === 10);
      expect(devGroup).toBeDefined();
      expect(devGroup?.groupTitle).toBe('Development');
      expect(devGroup?.count).toBe(2);
      expect(devGroup?.stats.minAgeMs).toBeGreaterThanOrEqual(4900);
      expect(devGroup?.stats.maxAgeMs).toBeGreaterThanOrEqual(14900);
      expect(devGroup?.stats.meanAgeMs).toBeCloseTo(10000, -2);

      const ungrouped = stats.byGroup.find((g) => g.groupId === -1);
      expect(ungrouped).toBeDefined();
      expect(ungrouped?.groupTitle).toBe('Ungrouped');
      expect(ungrouped?.count).toBe(1);
      expect(ungrouped?.stats.minAgeMs).toBeGreaterThanOrEqual(29900);

      // Verify domain statistics
      expect(stats.byDomain).toHaveLength(2);

      const githubDomain = stats.byDomain.find((d) => d.domain === 'github.com');
      expect(githubDomain).toBeDefined();
      expect(githubDomain?.count).toBe(2);
      expect(githubDomain?.stats.minAgeMs).toBeGreaterThanOrEqual(4900);

      const googleDomain = stats.byDomain.find((d) => d.domain === 'google.com');
      expect(googleDomain).toBeDefined();
      expect(googleDomain?.count).toBe(1);
    });
  });
});
