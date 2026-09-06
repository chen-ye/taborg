export interface TabInfo {
  id: number;
  title: string;
  url: string;
  windowId: number;
  groupId: number;
  index: number;
  active: boolean;
  pinned: boolean;
  favIconUrl?: string;
  lastAccessed?: number;
  openerTabId?: number;
  firstAccessed?: number;
}

export interface GroupInfo {
  id: number;
  title: string;
  color: string;
  windowId: number;
  collapsed: boolean;
}

export interface WindowInfo {
  id: number;
  focused: boolean;
  state?: string;
  type?: string;
  width?: number;
  height?: number;
  top?: number;
  left?: number;
  name?: string;
}

export interface CreateTabOptions {
  url?: string;
  windowId?: number;
  index?: number;
  active?: boolean;
  pinned?: boolean;
  groupId?: number;
}

import { StorageKeys } from '../../utils/storage-keys.js';
export function assertNonEmptyArray<T>(arr: T[]): asserts arr is [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error('Array cannot be empty');
  }
}

// Type guard to ensure item has an ID
function hasId<T extends { id?: number }>(item: T): item is T & { id: number } {
  return item.id !== undefined;
}

export function getRealUrl(url: string): string {
  try {
    if (url.startsWith('chrome-extension://') && url.includes('url=')) {
      const urlObj = new URL(url);
      const decoded = urlObj.searchParams.get('url');
      if (decoded?.startsWith('http')) {
        return decoded;
      }
    }
  } catch {
    // Fallback to raw URL
  }
  return url;
}

export function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i');
}

export function matchQuery(text: string, query: string): boolean {
  if (query.includes('*') || query.includes('?')) {
    try {
      return globToRegex(query).test(text);
    } catch {
      // Fallback to simple substring match
    }
  }
  return text.toLowerCase().includes(query.toLowerCase());
}

export interface GetTabsQuery extends chrome.tabs.QueryInfo {
  ungroupedOnly?: boolean;
  excludeGroupIds?: number[];
  titleQuery?: string;
  urlQuery?: string;
  lastAccessedBefore?: number;
  lastAccessedAfter?: number;
  firstAccessedBefore?: number;
  firstAccessedAfter?: number;
}

/**
 * Service for interacting with the Chrome browser's tabs, groups, and windows.
 * Provides a simplified, promise-based API over the standard chrome.* APIs.
 */
export class BrowserService {
  private firstAccessedMap = new Map<number, number>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      this.initFirstAccessedTracking();
    }
  }

  private initFirstAccessedTracking() {
    try {
      if (chrome.tabs.onCreated && chrome.tabs.onRemoved) {
        chrome.tabs.onCreated.addListener(async (tab) => {
          if (tab.id !== undefined) {
            await this.ensureLoaded();
            this.firstAccessedMap.set(tab.id, Date.now());
            await this.saveMap();
          }
        });

        chrome.tabs.onRemoved.addListener(async (tabId) => {
          await this.ensureLoaded();
          if (this.firstAccessedMap.has(tabId)) {
            this.firstAccessedMap.delete(tabId);
            await this.saveMap();
          }
        });
      }
    } catch (e) {
      console.error('Failed to register firstAccessed tracking listeners:', e);
    }
  }

  private async ensureLoaded() {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const result = await chrome.storage.local.get(StorageKeys.Local.FIRST_ACCESSED);
        const data = result[StorageKeys.Local.FIRST_ACCESSED] || {};
        for (const [key, val] of Object.entries(data)) {
          this.firstAccessedMap.set(Number(key), Number(val));
        }

        // Sync with currently open tabs
        const tabs = await chrome.tabs.query({});
        const activeIds = new Set<number>();
        let changed = false;
        const now = Date.now();

        for (const tab of tabs) {
          if (tab.id !== undefined) {
            activeIds.add(tab.id);
            if (!this.firstAccessedMap.has(tab.id)) {
              this.firstAccessedMap.set(tab.id, now);
              changed = true;
            }
          }
        }

        // Cleanup tabs that are no longer active
        for (const key of this.firstAccessedMap.keys()) {
          if (!activeIds.has(key)) {
            this.firstAccessedMap.delete(key);
            changed = true;
          }
        }

        if (changed) {
          await this.saveMap();
        }
      } catch (e) {
        console.error('Error during firstAccessed ensureLoaded:', e);
      } finally {
        this.isLoaded = true;
      }
    })();

    return this.loadPromise;
  }

  private async saveMap() {
    try {
      const data: Record<number, number> = {};
      for (const [key, val] of this.firstAccessedMap.entries()) {
        data[key] = val;
      }
      await chrome.storage.local.set({ [StorageKeys.Local.FIRST_ACCESSED]: data });
    } catch (e) {
      console.error('Error during firstAccessed saveMap:', e);
    }
  }
  /**
   * Retrieves a list of tabs matching the specified query.
   * Maps standard chrome.tabs.Tab objects to TabInfo.
   */
  async getTabs(query: GetTabsQuery = {}): Promise<TabInfo[]> {
    await this.ensureLoaded();
    const {
      ungroupedOnly,
      excludeGroupIds,
      titleQuery,
      urlQuery,
      lastAccessedBefore,
      lastAccessedAfter,
      firstAccessedBefore,
      firstAccessedAfter,
      ...chromeQuery
    } = query;
    const tabs = await chrome.tabs.query(chromeQuery);
    let mapped = tabs.filter(hasId).map((t) => ({
      id: t.id,
      title: t.title || '',
      url: getRealUrl(t.url || ''),
      windowId: t.windowId,
      groupId: t.groupId,
      index: t.index,
      active: t.active,
      pinned: t.pinned ?? false,
      favIconUrl: t.favIconUrl,
      lastAccessed: t.lastAccessed,
      openerTabId: t.openerTabId,
      firstAccessed: this.firstAccessedMap.get(t.id),
    }));

    if (ungroupedOnly) {
      mapped = mapped.filter((t) => t.groupId === -1);
    }

    if (excludeGroupIds && excludeGroupIds.length > 0) {
      mapped = mapped.filter((t) => !excludeGroupIds.includes(t.groupId));
    }

    if (titleQuery) {
      mapped = mapped.filter((t) => matchQuery(t.title, titleQuery));
    }

    if (urlQuery) {
      mapped = mapped.filter((t) => matchQuery(t.url, urlQuery));
    }

    if (lastAccessedBefore !== undefined) {
      mapped = mapped.filter((t) => t.lastAccessed === undefined || t.lastAccessed < lastAccessedBefore);
    }

    if (lastAccessedAfter !== undefined) {
      mapped = mapped.filter((t) => t.lastAccessed === undefined || t.lastAccessed > lastAccessedAfter);
    }

    if (firstAccessedBefore !== undefined) {
      mapped = mapped.filter((t) => t.firstAccessed === undefined || t.firstAccessed < firstAccessedBefore);
    }

    if (firstAccessedAfter !== undefined) {
      mapped = mapped.filter((t) => t.firstAccessed === undefined || t.firstAccessed > firstAccessedAfter);
    }

    return mapped;
  }

  async getGroups(query: chrome.tabGroups.QueryInfo = {}): Promise<GroupInfo[]> {
    const groups = await chrome.tabGroups.query(query);
    return groups.map((g) => ({
      id: g.id,
      title: g.title || '',
      color: g.color,
      windowId: g.windowId,
      collapsed: g.collapsed,
    }));
  }

  async getWindows(): Promise<WindowInfo[]> {
    const windows = await chrome.windows.getAll({ populate: false });
    const windowNames = await this.getWindowNames();
    return windows.filter(hasId).map((w) => ({
      id: w.id,
      focused: w.focused,
      state: w.state,
      type: w.type,
      width: w.width,
      height: w.height,
      top: w.top,
      left: w.left,
      name: windowNames[w.id] || undefined,
    }));
  }

  async setWindowName(windowId: number, name: string) {
    const names = await this.getWindowNames();
    names[windowId] = name;
    await chrome.storage.local.set({ [StorageKeys.Local.WINDOW_NAMES]: names });
  }

  private async getWindowNames(): Promise<Record<number, string>> {
    const result = await chrome.storage.local.get(StorageKeys.Local.WINDOW_NAMES);
    return (result[StorageKeys.Local.WINDOW_NAMES] as Record<number, string>) || {};
  }

  async getTab(tabId: number): Promise<TabInfo> {
    await this.ensureLoaded();
    const t = await chrome.tabs.get(tabId);
    return {
      id: t.id ?? tabId,
      title: t.title || '',
      url: getRealUrl(t.url || ''),
      windowId: t.windowId,
      groupId: t.groupId,
      index: t.index,
      active: t.active,
      pinned: t.pinned ?? false,
      favIconUrl: t.favIconUrl,
      lastAccessed: t.lastAccessed,
      openerTabId: t.openerTabId,
      firstAccessed: this.firstAccessedMap.get(t.id ?? tabId),
    };
  }

  async getGroup(groupId: number): Promise<GroupInfo> {
    const g = await chrome.tabGroups.get(groupId);
    return {
      id: g.id,
      title: g.title || '',
      color: g.color,
      windowId: g.windowId,
      collapsed: g.collapsed,
    };
  }

  async groupTabs(tabIds: number[], groupId?: number, createGroupTitle?: string): Promise<number> {
    assertNonEmptyArray(tabIds);

    let targetWindowId: number;
    let wasCollapsed = false;

    if (groupId) {
      const group = await this.getGroup(groupId);
      wasCollapsed = group.collapsed;
      targetWindowId = group.windowId;
    } else {
      const firstTab = await this.getTab(tabIds[0]);
      targetWindowId = firstTab.windowId;
    }

    // Move all tabs to the end of the target window to safely preserve order without breaking group continuity
    await chrome.tabs.move(tabIds, { windowId: targetWindowId, index: -1 });

    const newGroupId = await chrome.tabs.group({ tabIds, groupId });

    if (createGroupTitle) {
      await chrome.tabGroups.update(newGroupId, { title: createGroupTitle });
    } else if (wasCollapsed) {
      // Restore collapsed state if it was collapsed
      await chrome.tabGroups.update(newGroupId, { collapsed: true });
    }

    return newGroupId;
  }

  async ungroupTabs(tabIds: number[]) {
    assertNonEmptyArray(tabIds);
    await chrome.tabs.ungroup(tabIds);
  }

  async moveTabs(tabIds: number[], windowId: number, index: number = -1) {
    await chrome.tabs.move(tabIds, { windowId, index });
  }

  async closeTabs(tabIds: number | number[]) {
    if (Array.isArray(tabIds)) {
      await chrome.tabs.remove(tabIds);
    } else {
      await chrome.tabs.remove(tabIds);
    }
  }

  async createTab(options: CreateTabOptions): Promise<TabInfo> {
    const { groupId, ...createProps } = options;
    const tab = await chrome.tabs.create({
      active: false,
      ...createProps,
    });
    if (tab.id !== undefined && groupId !== undefined && groupId !== -1) {
      await chrome.tabs.group({ tabIds: [tab.id], groupId });
    }
    return this.getTab(tab.id ?? -1);
  }

  async createTabs(tabs: CreateTabOptions[]): Promise<TabInfo[]> {
    assertNonEmptyArray(tabs);
    const created: TabInfo[] = [];
    for (const tabOpts of tabs) {
      const tabInfo = await this.createTab(tabOpts);
      created.push(tabInfo);
    }
    return created;
  }

  async focusTab(tabId: number) {
    const tab = await this.getTab(tabId);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  /**
   * Updates properties of an existing tab group (e.g., title, color).
   */
  async updateGroup(groupId: number, updateInfo: chrome.tabGroups.UpdateProperties) {
    await chrome.tabGroups.update(groupId, updateInfo);
  }

  async moveGroup(groupId: number, windowId: number, index: number = -1) {
    await chrome.tabGroups.move(groupId, { windowId, index });
  }

  async getTabChains(focalTabIds: number[] = [], groupIds: number[] = [], maxDistance: number = 3): Promise<TabInfo[]> {
    await this.ensureLoaded();
    const allTabs = await this.getTabs({});

    const focalIds = new Set<number>(focalTabIds);
    if (groupIds.length > 0) {
      for (const tab of allTabs) {
        if (groupIds.includes(tab.groupId)) {
          focalIds.add(tab.id);
        }
      }
    }

    if (focalIds.size === 0) {
      return [];
    }

    const chainIds = new Set<number>();

    for (const focalId of focalIds) {
      const focalTab = allTabs.find((t) => t.id === focalId);
      if (!focalTab) continue;

      const windowId = focalTab.windowId;
      const index = focalTab.index;

      // Proximity in the same window
      const adjacentTabs = allTabs.filter((t) => t.windowId === windowId && Math.abs(t.index - index) <= maxDistance);
      for (const t of adjacentTabs) {
        chainIds.add(t.id);
      }

      // Opener hierarchy (children)
      const openerChildren = allTabs.filter((t) => t.openerTabId === focalId);
      for (const t of openerChildren) {
        chainIds.add(t.id);
      }

      // Opener hierarchy (parent)
      if (focalTab.openerTabId !== undefined) {
        chainIds.add(focalTab.openerTabId);
      }
    }

    // Only return tabs that:
    // - were discovered in proximity
    // - are not part of the original focal target set
    // - are strictly ungrouped
    return allTabs.filter((t) => {
      return chainIds.has(t.id) && !focalIds.has(t.id) && t.groupId === -1;
    });
  }

  async getSummaryStatistics(): Promise<SummaryStatisticsResult> {
    await this.ensureLoaded();
    const tabs = await this.getTabs({});
    const groups = await this.getGroups({});
    const groupMap = new Map<number, string>();
    for (const g of groups) {
      groupMap.set(g.id, g.title || `Group ${g.id}`);
    }

    const now = Date.now();

    // Group Stats
    const groupTabsMap = new Map<number, TabInfo[]>();
    for (const tab of tabs) {
      const gid = tab.groupId;
      let arr = groupTabsMap.get(gid);
      if (!arr) {
        arr = [];
        groupTabsMap.set(gid, arr);
      }
      arr.push(tab);
    }

    const byGroup: GroupStats[] = [];
    for (const [gid, gTabs] of groupTabsMap.entries()) {
      const ages = gTabs
        .map((t) => (t.lastAccessed ? now - t.lastAccessed : null))
        .filter((age): age is number => age !== null && age >= 0);

      const stats = calculateStats(ages);
      const title = gid === -1 ? 'Ungrouped' : groupMap.get(gid) || `Group ${gid}`;
      byGroup.push({
        groupId: gid,
        groupTitle: title,
        count: gTabs.length,
        stats,
      });
    }

    byGroup.sort((a, b) => b.count - a.count);

    // Domain Stats
    const domainTabsMap = new Map<string, TabInfo[]>();
    for (const tab of tabs) {
      const domain = getTabDomain(tab.url);
      let arr = domainTabsMap.get(domain);
      if (!arr) {
        arr = [];
        domainTabsMap.set(domain, arr);
      }
      arr.push(tab);
    }

    const byDomain: DomainStats[] = [];
    for (const [domain, dTabs] of domainTabsMap.entries()) {
      const ages = dTabs
        .map((t) => (t.lastAccessed ? now - t.lastAccessed : null))
        .filter((age): age is number => age !== null && age >= 0);

      const stats = calculateStats(ages);
      byDomain.push({
        domain,
        count: dTabs.length,
        stats,
      });
    }

    byDomain.sort((a, b) => b.count - a.count);

    return {
      totalTabs: tabs.length,
      byGroup,
      byDomain,
    };
  }
}

export interface SummaryStats {
  minAgeMs: number | null;
  maxAgeMs: number | null;
  meanAgeMs: number | null;
}

export interface GroupStats {
  groupId: number;
  groupTitle: string;
  count: number;
  stats: SummaryStats;
}

export interface DomainStats {
  domain: string;
  count: number;
  stats: SummaryStats;
}

export interface SummaryStatisticsResult {
  totalTabs: number;
  byGroup: GroupStats[];
  byDomain: DomainStats[];
}

function calculateStats(ages: number[]): SummaryStats {
  if (ages.length === 0) {
    return { minAgeMs: null, maxAgeMs: null, meanAgeMs: null };
  }
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  const sum = ages.reduce((a, b) => a + b, 0);
  const mean = sum / ages.length;
  return { minAgeMs: min, maxAgeMs: max, meanAgeMs: mean };
}

function getTabDomain(urlStr: string): string {
  try {
    if (!urlStr) return 'unknown';
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export const browserService = new BrowserService();
