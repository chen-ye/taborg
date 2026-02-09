import Fuse from 'fuse.js';
import { Signal } from 'signal-polyfill';
import { SignalArray } from 'signal-utils/array';
import { SignalMap } from 'signal-utils/map';
import { SignalSet } from 'signal-utils/set';
import { MessageTypes } from '../../utils/message-types.js';
import { StorageKeys } from '../../utils/storage-keys.js';
import { normalizeUrl } from '../../utils/url-utils.js';
import { browserService } from './browser-service';
import { suggestionService } from './suggestion-service';

export interface TabNode {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  groupId: number;
  windowId: number;
  active: boolean;
  selected: boolean; // Added for reactive collections
  suggestedGroups?: string[]; // Added for reactive collections
}

export interface ViewOptions {
  viewMode: 'compact' | 'detailed';
}

export interface GroupNode {
  id: number;
  title: string;
  color: string;
  windowId: number;
  collapsed: boolean;
  tabs: TabNode[];
}

export interface WindowNode {
  id: number;
  focused: boolean;
  tabs: TabNode[]; // Ungrouped tabs
  groups: GroupNode[];
}

export class TabStore {
  private refreshTimeout: number | null = null;

  // State
  windows = new SignalArray<WindowNode>([]);
  selectedTabIds = new SignalSet<number>();
  suggestionsUrlMap = new Signal.State(new Map<string, string[]>());
  processingTabIds = new Signal.State(new Set<number>()); // Changed for atomic updates
  windowNames = new SignalMap<number, string>();
  collapsedWindowIds = new SignalSet<number>();

  private groupIdMap = new Signal.State(new Map<number, GroupNode>());

  draggingState = new Signal.State<{ type: 'tab' | 'group' | 'window'; id: number } | null>(null);
  followMode = new Signal.State(false); // Added for Follow Me mode
  viewOptions = new Signal.State<ViewOptions>({ viewMode: 'compact' });

  // Batching state for selection updates
  private pendingSelectionChanges: Set<number> | null = null;
  private selectionUpdateFrameId: number | null = null;
  private saveSelectionTimeout: number | null = null;
  isInitializing = new Signal.State(true);
  currentWindowId = new Signal.State<number | undefined>(undefined);

  groupsByName = new Signal.Computed(() => {
    const map = new Map<string, GroupNode>();
    for (const w of this.windows) {
      // Direct access
      for (const g of w.groups) {
        if (g.title) {
          map.set(g.title, g);
        }
      }
    }
    console.log('Computed groupsByName:', map);
    return map;
  });

  sortedWindows = new Signal.Computed<WindowNode[]>(() => {
    const windows = this.windows; // Direct access
    const currentId = this.currentWindowId.get();

    return [...windows].sort((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      return a.id - b.id;
    });
  });

  allTabsById = new Signal.Computed(() => {
    const map = new Map<number, TabNode>();
    for (const w of this.windows) {
      // Direct access
      for (const t of w.tabs) {
        map.set(t.id, t);
      }
      for (const g of w.groups) {
        for (const t of g.tabs) {
          map.set(t.id, t);
        }
      }
    }
    return map;
  });

  selectedTabs = new Signal.Computed(() => {
    const selected: TabNode[] = [];
    const selectedIds = this.selectedTabIds; // Direct access
    const allTabs = this.allTabsById.get();

    for (const id of selectedIds) {
      const tab = allTabs.get(id);
      if (tab) selected.push(tab);
    }
    return selected;
  });

  sortedSelectedTabs = new Signal.Computed(() => {
    const selected = this.selectedTabs.get();
    return selected.toSorted((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }));
  });

  activeTabId = new Signal.Computed(() => {
    const currentId = this.currentWindowId.get();
    if (currentId !== undefined) {
      const currentWindow = this.windows.find((w) => w.id === currentId);
      if (currentWindow) {
        // Check ungrouped tabs
        for (const tab of currentWindow.tabs) {
          if (tab.active) return tab.id;
        }
        // Check grouped tabs
        for (const group of currentWindow.groups) {
          for (const tab of group.tabs) {
            if (tab.active) return tab.id;
          }
        }
      }
    }
    return undefined;
  });

  activeTab = new Signal.Computed(() => {
    const id = this.activeTabId.get();
    if (id === undefined) return undefined;

    // We need to look it up from allTabsById
    return this.allTabsById.get().get(id);
  });

  similarTabs = new Signal.Computed(() => {
    const active = this.activeTab.get();
    if (!active || !active.url) return [];

    let hostname = '';
    try {
      hostname = new URL(active.url).hostname;
    } catch {
      // Invalid URL or empty
    }

    const allTabs = Array.from(this.allTabsById.get().values());
    const candidates = allTabs.filter((t) => t.id !== active.id && t.url);

    // 1. Domain match
    const domainMatches = new Set<TabNode>();
    if (hostname) {
      for (const t of candidates) {
        try {
          if (new URL(t.url).hostname === hostname) {
            domainMatches.add(t);
          }
        } catch {}
      }
    }

    // 2. Fuzzy match title using Fuse.js
    let fuzzyMatches: TabNode[] = [];
    if (active.title) {
      const options = {
        keys: ['title'],
        threshold: 0.6, // Match sensitivity
      };
      const fuse = new Fuse(candidates, options);
      // Limit results to avoid noise?
      const results = fuse.search(active.title, { limit: 10 });
      fuzzyMatches = results.map((r) => r.item);
    }

    // Merge: Domain matches first, then fuzzy matches. Deduplicate.
    const result = domainMatches.union(new Set(fuzzyMatches));

    return Array.from(result);
  });

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.windows) {
      this.init();
    }
  }

  private async init() {
    try {
      // Load data without triggering re-renders
      const [suggestionsMap, selectedIds, windowNamesMap, collapsedWindowIdsSet, , currentWindow] = await Promise.all([
        this.loadSuggestions(),
        this.loadSelection(),
        this.loadWindowNames(),
        this.loadCollapsedWindows(),
        this.loadFollowMode(),
        chrome.windows.getCurrent(),
      ]);

      await this.loadViewOptions();
      await this.loadProcessingState(); // Load initial processing state

      // Batch all signal updates together
      this.suggestionsUrlMap.set(suggestionsMap);
      for (const id of selectedIds) this.selectedTabIds.add(id);
      for (const [key, value] of windowNamesMap) this.windowNames.set(key, value);
      for (const id of collapsedWindowIdsSet) this.collapsedWindowIds.add(id);

      if (currentWindow?.id) {
        this.currentWindowId.set(currentWindow.id);
      }

      console.log('Loaded initial data - suggestions, selection, windowNames, collapsedWindows, currentWindow');

      await this.fetchAll();
      this.isInitializing.set(false);
      this.setupListeners();
    } catch (e) {
      console.error('TabStore init failed:', e);
    }
  }

  private async loadSuggestions(): Promise<Map<string, string[]>> {
    const suggestionsByUrl = await suggestionService.getAllSuggestions();
    const loadedMap = new Map<string, string[]>();
    for (const url in suggestionsByUrl) {
      // Sort suggestions alphabetically
      loadedMap.set(
        url,
        suggestionsByUrl[url].sort((a, b) => a.localeCompare(b)),
      );
    }
    return loadedMap;
  }

  private async loadSelection(): Promise<Set<number>> {
    const result = await chrome.storage.local.get(StorageKeys.Local.SELECTED_TABS);
    const selected = (result[StorageKeys.Local.SELECTED_TABS] as number[]) || [];
    return new Set(selected);
  }

  private async loadWindowNames(): Promise<Map<number, string>> {
    const result = await chrome.storage.local.get(StorageKeys.Local.WINDOW_NAMES);
    const names = (result[StorageKeys.Local.WINDOW_NAMES] as Record<string, string>) || {};
    // Convert string keys back to numbers
    return new Map(Object.entries(names).map(([k, v]) => [Number(k), v]));
  }

  private async loadCollapsedWindows(): Promise<Set<number>> {
    const result = await chrome.storage.local.get(StorageKeys.Local.COLLAPSED_WINDOWS);
    const collapsed = (result[StorageKeys.Local.COLLAPSED_WINDOWS] as number[]) || [];
    return new Set(collapsed);
  }

  private async loadViewOptions(): Promise<void> {
    const result = await chrome.storage.local.get(StorageKeys.Local.VIEW_OPTIONS);
    const options = (result[StorageKeys.Local.VIEW_OPTIONS] as ViewOptions) || { viewMode: 'compact' };
    this.viewOptions.set(options);
    this.viewOptions.set(options);
  }

  private async loadFollowMode(): Promise<void> {
    const result = await chrome.storage.local.get(StorageKeys.Local.FOLLOW_MODE);
    const follow = (result[StorageKeys.Local.FOLLOW_MODE] as boolean) || false;
    this.followMode.set(follow);
  }

  private async loadProcessingState(): Promise<void> {
    const result = await chrome.storage.session.get(StorageKeys.Session.PROCESSING_TABS);
    const ids = (result[StorageKeys.Session.PROCESSING_TABS] as number[]) || [];
    this.processingTabIds.set(new Set(ids));
  }

  private async saveSelection() {
    // Debounce storage writes
    if (this.saveSelectionTimeout !== null) {
      clearTimeout(this.saveSelectionTimeout);
    }
    this.saveSelectionTimeout = window.setTimeout(async () => {
      this.saveSelectionTimeout = null;
      await chrome.storage.local.set({ [StorageKeys.Local.SELECTED_TABS]: Array.from(this.selectedTabIds.values()) });
    }, 500);
  }

  async setProcessing(ids: number[], processing: boolean) {
    // Optimistic update - Atomic
    const current = new Set(this.processingTabIds.get());
    if (processing) {
      for (const id of ids) current.add(id);
    } else {
      for (const id of ids) current.delete(id);
    }
    this.processingTabIds.set(current);

    // Persist to session storage so background script and other contexts see it
    const result = await chrome.storage.session.get(StorageKeys.Session.PROCESSING_TABS);
    const storageList = new Set((result[StorageKeys.Session.PROCESSING_TABS] as number[]) || []);

    if (processing) {
      for (const id of ids) storageList.add(id);
    } else {
      for (const id of ids) storageList.delete(id);
    }

    await chrome.storage.session.set({ [StorageKeys.Session.PROCESSING_TABS]: Array.from(storageList) });
  }

  async fetchAll() {
    console.log('fetch-all');
    const [windows, tabs, groups] = await Promise.all([
      browserService.getWindows(),
      browserService.getTabs(),
      browserService.getGroups(),
    ]);

    const groupMap = new Map<number, GroupNode>();

    groups.forEach((g) => {
      const groupNode: GroupNode = {
        id: g.id,
        title: g.title || '',
        color: g.color,
        windowId: g.windowId,
        collapsed: g.collapsed,
        tabs: [],
      };
      groupMap.set(g.id, groupNode);
    });

    const windowMap = new Map<number, WindowNode>();
    windows.forEach((w) => {
      windowMap.set(w.id, {
        id: w.id,
        focused: w.focused,
        tabs: [],
        groups: [],
      });
    });

    for (const t of tabs) {
      if (t.id === undefined || t.windowId === undefined) continue;

      const normalizedUrl = t.url ? normalizeUrl(t.url) : '';
      const suggestedGroups = normalizedUrl ? this.suggestionsUrlMap.get().get(normalizedUrl) : undefined;

      const tabNode: TabNode = {
        id: t.id,
        title: t.title || '',
        url: t.url || '',
        favIconUrl: t.favIconUrl,
        groupId: t.groupId,
        windowId: t.windowId,
        active: t.active || false,
        selected: this.selectedTabIds.has(t.id), // Added
        suggestedGroups, // Added
      };

      if (t.groupId > -1) {
        const group = groupMap.get(t.groupId);
        if (group) {
          group.tabs.push(tabNode);
          continue;
        }
      }

      const window = windowMap.get(t.windowId);
      if (window) {
        window.tabs.push(tabNode);
      }
    }

    // Assign groups to windows
    groupMap.forEach((g, id) => {
      const window = windowMap.get(g.windowId);
      if (window) {
        window.groups.push(g);
      } else {
        groupMap.delete(id);
      }
    });

    this.groupIdMap.set(groupMap);

    this.windows.splice(0, this.windows.length, ...Array.from(windowMap.values())); // Mutate SignalArray
    console.log('Updated windows:', this.windows);
  }

  setupListeners() {
    // Debounce refresh to batch rapid Chrome API events
    const debouncedRefresh = () => {
      if (this.refreshTimeout !== null) {
        clearTimeout(this.refreshTimeout);
      }
      this.refreshTimeout = window.setTimeout(() => {
        this.refreshTimeout = null;
        this.fetchAll();
      }, 50);
    };

    chrome.tabs.onCreated.addListener(debouncedRefresh);

    chrome.tabs.onUpdated.addListener(debouncedRefresh);

    chrome.tabs.onActivated.addListener(debouncedRefresh);
    // ... other listeners
    chrome.tabs.onMoved.addListener(debouncedRefresh);
    chrome.tabs.onRemoved.addListener(debouncedRefresh);
    chrome.tabs.onAttached.addListener(debouncedRefresh);
    chrome.tabs.onDetached.addListener(debouncedRefresh);

    chrome.tabGroups.onCreated.addListener(debouncedRefresh);
    chrome.tabGroups.onUpdated.addListener(debouncedRefresh);
    chrome.tabGroups.onMoved.addListener(debouncedRefresh);
    chrome.tabGroups.onRemoved.addListener(debouncedRefresh);

    chrome.windows.onCreated.addListener(debouncedRefresh);
    chrome.windows.onRemoved.addListener(debouncedRefresh);
    chrome.windows.onFocusChanged.addListener(debouncedRefresh);

    // Subscribe to suggestion changes using the service
    suggestionService.onChanged((map) => {
      // Create a fresh map to trigger reactivity
      const newMap = new Map(Object.entries(map));
      this.suggestionsUrlMap.set(newMap);
      this.fetchAll();
    });

    // Listen for storage changes (e.g. from background script)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[StorageKeys.Local.WINDOW_NAMES]) {
        this.loadWindowNames().then((map) => {
          this.windowNames.clear();
          for (const [key, value] of map) this.windowNames.set(key, value);
          this.fetchAll();
        });
      }
      if (areaName === 'local' && changes[StorageKeys.Local.COLLAPSED_WINDOWS]) {
        this.loadCollapsedWindows().then((set) => {
          this.collapsedWindowIds.clear();
          for (const id of set) this.collapsedWindowIds.add(id);
        });
      }
      if (areaName === 'session' && changes[StorageKeys.Session.PROCESSING_TABS]) {
        const newValue = (changes[StorageKeys.Session.PROCESSING_TABS].newValue as number[]) || [];
        this.processingTabIds.set(new Set(newValue));
      }
    });
  }

  private flushSelectionUpdates() {
    if (this.pendingSelectionChanges !== null) {
      this.selectedTabIds.clear();
      for (const id of this.pendingSelectionChanges) {
        this.selectedTabIds.add(id);
      }
      console.log('Flushed batched selectedTabIds:', this.selectedTabIds);
      this.pendingSelectionChanges = null;
      this.saveSelection();
    }
    this.selectionUpdateFrameId = null;
  }

  toggleSelection(id: number, type: 'tab' | 'group' | 'window', selected: boolean) {
    // Initialize pending changes with current selection if not already batching
    let pending = this.pendingSelectionChanges;
    if (pending === null) {
      pending = new Set(this.selectedTabIds.values()); // Use .values() for SignalSet
      this.pendingSelectionChanges = pending;
    }

    if (type === 'tab') {
      if (selected) pending.add(id);
      else pending.delete(id);
    } else if (type === 'group') {
      const group = this.findGroup(id);
      if (group) {
        group.tabs.forEach((t) => {
          if (selected) pending.add(t.id);
          else pending.delete(t.id);
        });
      }
    } else if (type === 'window') {
      const win = this.windows.find((w: WindowNode) => w.id === id); // Direct access
      if (win) {
        win.tabs.forEach((t: TabNode) => {
          if (selected) pending.add(t.id);
          else pending.delete(t.id);
        });
        win.groups.forEach((g: GroupNode) => {
          g.tabs.forEach((t: TabNode) => {
            if (selected) pending.add(t.id);
            else pending.delete(t.id);
          });
        });
      }
    }

    // Schedule flush if not already scheduled
    if (this.selectionUpdateFrameId === null) {
      this.selectionUpdateFrameId = requestAnimationFrame(() => this.flushSelectionUpdates());
    }
  }

  setSelectedTabs(ids: Set<number>) {
    // Cancel any pending batched update
    if (this.selectionUpdateFrameId !== null) {
      cancelAnimationFrame(this.selectionUpdateFrameId);
      this.selectionUpdateFrameId = null;
      this.pendingSelectionChanges = null;
    }

    this.selectedTabIds.clear();
    for (const id of ids) {
      this.selectedTabIds.add(id);
    }
    console.log('Updated selectedTabIds (set):', this.selectedTabIds);
    this.saveSelection();
  }

  findGroup(id: number): GroupNode | undefined {
    return this.groupIdMap.get().get(id);
  }

  async closeTab(id: number) {
    await browserService.closeTabs(id);
  }

  async focusTab(id: number) {
    await browserService.focusTab(id);
  }

  async closeGroup(id: number) {
    const group = this.findGroup(id);
    if (group) {
      const tabIds = group.tabs.map((t) => t.id);
      await browserService.closeTabs(tabIds);
    }
  }

  async moveTabAfterActive(tabId: number) {
    const activeTabId = this.activeTabId.get();
    if (!activeTabId) return;

    const activeTab = await browserService.getTab(activeTabId);

    // Move to the same window as active tab, right after it
    await browserService.moveTabs([tabId], activeTab.windowId, activeTab.index + 1);
  }

  async moveTabToGroup(tabId: number, groupId: number) {
    // browserService.groupTabs handles window movement if tab is in diff window
    await browserService.groupTabs([tabId], groupId);
  }

  async createGroupForTab(tabId: number, title: string) {
    await browserService.groupTabs([tabId], undefined, title);
  }

  async renameGroup(groupId: number, title: string) {
    await browserService.updateGroup(groupId, { title });
  }

  async collapseGroup(groupId: number, collapsed: boolean) {
    await browserService.updateGroup(groupId, { collapsed });
  }

  async setAllGroupsCollapsed(collapsed: boolean) {
    const updates: Promise<void>[] = [];
    this.windows.forEach((w: WindowNode) => {
      // Direct access
      w.groups.forEach((g: GroupNode) => {
        if (g.collapsed !== collapsed) {
          updates.push(browserService.updateGroup(g.id, { collapsed }));
        }
      });
    });
    await Promise.all(updates);
    // fetchAll will be triggered by onUpdated listener, but we can call it to be sure/faster?
    // The listener might be enough, but let's wait for it.
  }

  getSelectedTabs(): TabNode[] {
    return this.selectedTabs.get();
  }

  getTabsWithoutSuggestions(): TabNode[] {
    return [...this.windows]
      .flatMap((w: WindowNode) => [...w.tabs, ...w.groups.flatMap((g: GroupNode) => g.tabs)])
      .filter((t: TabNode) => !t.suggestedGroups || t.suggestedGroups.length === 0);
  }

  selectUngroupedTabs() {
    // Cancel any pending batched update
    if (this.selectionUpdateFrameId !== null) {
      cancelAnimationFrame(this.selectionUpdateFrameId);
      this.selectionUpdateFrameId = null;
      this.pendingSelectionChanges = null;
    }

    this.selectedTabIds.clear(); // Clear existing selection
    this.windows.forEach((w: WindowNode) => {
      // Direct access
      w.tabs.forEach((t: TabNode) => {
        this.selectedTabIds.add(t.id);
      });
    });
    console.log('Updated selectedTabIds (ungrouped):', this.selectedTabIds);
    this.saveSelection();
  }

  selectDuplicateTabs() {
    // Cancel any pending batched update
    if (this.selectionUpdateFrameId !== null) {
      cancelAnimationFrame(this.selectionUpdateFrameId);
      this.selectionUpdateFrameId = null;
      this.pendingSelectionChanges = null;
    }

    const urlCounts = new Map<string, number>();
    const allTabs: TabNode[] = [];

    // 1. Collect all tabs and count URLs
    const collectTabs = (tabs: TabNode[]) => {
      for (const t of tabs) {
        if (!t.url) continue;
        allTabs.push(t);
        urlCounts.set(t.url, (urlCounts.get(t.url) || 0) + 1);
      }
    };

    for (const w of this.windows) {
      // Direct access
      collectTabs(w.tabs);
      for (const g of w.groups) {
        collectTabs(g.tabs);
      }
    }

    // 2. Identify duplicate URLs
    const duplicateUrls = new Set<string>();
    for (const [url, count] of urlCounts) {
      if (count > 1) {
        duplicateUrls.add(url);
      }
    }

    // 3. Select tabs with duplicate URLs
    this.selectedTabIds.clear();
    for (const t of allTabs) {
      if (t.url && duplicateUrls.has(t.url)) {
        this.selectedTabIds.add(t.id);
      }
    }

    console.log('Selected duplicate tabs:', this.selectedTabIds);
    this.saveSelection();
  }

  async closeTabs(ids: number[]) {
    await browserService.closeTabs(ids);
  }

  async clearSuggestions(tabId: number) {
    // Update storage and cache
    const tabs = await browserService.getTabs();
    const tab = tabs.find((t) => t.id === tabId);

    if (tab?.url) {
      // Optimistic update
      const currentMap = new Map(this.suggestionsUrlMap.get());
      if (currentMap.has(tab.url)) {
        currentMap.delete(tab.url);
        this.suggestionsUrlMap.set(currentMap);
      }

      chrome.runtime.sendMessage({ type: MessageTypes.CLEAR_SUGGESTIONS, url: tab.url });
    }
  }

  getGroupByName(name: string): GroupNode | undefined {
    return this.groupsByName.get().get(name);
  }

  getAllGroups(): GroupNode[] {
    return Array.from(this.groupsByName.get().values());
  }

  async setWindowName(windowId: number, name: string) {
    this.windowNames.set(windowId, name);
    console.log('Updated windowNames:', this.windowNames);

    const namesObj = Object.fromEntries(this.windowNames.entries());
    await chrome.storage.local.set({ [StorageKeys.Local.WINDOW_NAMES]: namesObj });

    this.fetchAll();
  }

  async setWindowCollapsed(windowId: number, collapsed: boolean) {
    if (collapsed) {
      this.collapsedWindowIds.add(windowId);
    } else {
      this.collapsedWindowIds.delete(windowId);
    }
    console.log('Updated collapsedWindowIds:', this.collapsedWindowIds);

    await chrome.storage.local.set({
      [StorageKeys.Local.COLLAPSED_WINDOWS]: Array.from(this.collapsedWindowIds.values()),
    });
  }

  async moveTabToWindow(tabId: number, windowId: number) {
    await browserService.moveTabs([tabId], windowId);
  }

  async moveGroupToWindow(groupId: number, windowId: number) {
    await browserService.moveGroup(groupId, windowId);
  }

  async mergeGroups(sourceGroupId: number, targetGroupId: number) {
    const sourceGroup = this.findGroup(sourceGroupId);
    const targetGroup = this.findGroup(targetGroupId);
    if (!sourceGroup || !targetGroup) return;

    // BrowserService.groupTabs handles window movement, but we need to pass IDs
    const tabIds = sourceGroup.tabs.map((t) => t.id);
    if (tabIds.length === 0) return;

    await browserService.groupTabs(tabIds, targetGroupId);
  }

  async mergeWindows(sourceWindowId: number, targetWindowId: number) {
    const sourceWindow = this.windows.find((w: WindowNode) => w.id === sourceWindowId); // Direct access
    if (!sourceWindow) return;

    // Move all groups
    for (const group of sourceWindow.groups) {
      await browserService.moveGroup(group.id, targetWindowId);
    }

    // Move all ungrouped tabs
    const tabIds = sourceWindow.tabs.map((t: TabNode) => t.id);
    if (tabIds.length > 0) {
      await browserService.moveTabs(tabIds, targetWindowId);
    }
  }

  toggleFollowMode() {
    const newState = !this.followMode.get();
    this.followMode.set(newState);
    chrome.storage.local.set({ 'follow-mode': newState });
  }

  async setViewMode(mode: 'compact' | 'detailed') {
    const newOptions: ViewOptions = { viewMode: mode };
    this.viewOptions.set(newOptions);
    await chrome.storage.local.set({ 'view-options': newOptions });
  }
}

export const tabStore = new TabStore();
