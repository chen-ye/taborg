import { Signal } from 'signal-polyfill';
import { SignalArray } from 'signal-utils/array';
import { SignalSet } from 'signal-utils/set';
import { SignalMap } from 'signal-utils/map';

// Polyfill Signal for @lit-labs/signals if not present
if (!(globalThis as any).Signal) {
  (globalThis as any).Signal = Signal;
}

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

class TabStore {
  private refreshTimeout: number | null = null;

  // State
  windows = new SignalArray<WindowNode>([]);
  selectedTabIds = new SignalSet<number>();
  suggestionsUrlMap = new SignalMap<string, string[]>();
  windowNames = new SignalMap<number, string>();
  collapsedWindowIds = new SignalSet<number>();

  // Batching state for selection updates
  private pendingSelectionChanges: Set<number> | null = null;
  private selectionUpdateFrameId: number | null = null;
  private saveSelectionTimeout: number | null = null;
  isInitializing = new Signal.State(true);
  currentWindowId = new Signal.State<number | undefined>(undefined);

  groupsByName = new Signal.Computed(() => {
    const map = new Map<string, GroupNode>();
    for (const w of this.windows) { // Direct access
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

  selectedTabs = new Signal.Computed(() => {
    const selected: TabNode[] = [];
    const selectedIds = this.selectedTabIds; // Direct access

    for (const w of this.windows) { // Direct access
      for (const t of w.tabs) {
        if (selectedIds.has(t.id)) selected.push(t);
      }
      for (const g of w.groups) {
        for (const t of g.tabs) {
          if (selectedIds.has(t.id)) selected.push(t);
        }
      }
    }
    console.log('Computed selectedTabs:', selected);
    return selected;
  });

  constructor() {
    this.init();
  }

  private async init() {
    // Load data without triggering re-renders
    const [suggestionsMap, selectedIds, windowNamesMap, collapsedWindowIdsSet, currentWindow] = await Promise.all([
      this.loadSuggestions(),
      this.loadSelection(),
      this.loadWindowNames(),
      this.loadCollapsedWindows(),
      chrome.windows.getCurrent()
    ]);

    // Batch all signal updates together
    for (const [key, value] of suggestionsMap) this.suggestionsUrlMap.set(key, value);
    for (const id of selectedIds) this.selectedTabIds.add(id);
    for (const [key, value] of windowNamesMap) this.windowNames.set(key, value);
    for (const id of collapsedWindowIdsSet) this.collapsedWindowIds.add(id);
    this.currentWindowId.set(currentWindow.id);
    console.log('Loaded initial data - suggestions, selection, windowNames, collapsedWindows, currentWindow');

    await this.fetchAll();
    this.isInitializing.set(false);
    this.setupListeners();
  }

  private async loadSuggestions(): Promise<Map<string, string[]>> {
    const result = await chrome.storage.local.get('tab-suggestions');
    const suggestionsByUrl = (result['tab-suggestions'] as Record<string, string[]>) || {};
    const loadedMap = new Map<string, string[]>();
    for (const url in suggestionsByUrl) {
      // Sort suggestions alphabetically
      loadedMap.set(url, suggestionsByUrl[url].sort((a, b) => a.localeCompare(b)));
    }
    return loadedMap;
  }

  private async loadSelection(): Promise<Set<number>> {
    const result = await chrome.storage.local.get('selected-tabs');
    const selected = (result['selected-tabs'] as number[]) || [];
    return new Set(selected);
  }

  private async loadWindowNames(): Promise<Map<number, string>> {
    const result = await chrome.storage.local.get('window-names');
    const names = (result['window-names'] as Record<string, string>) || {};
    // Convert string keys back to numbers
    return new Map(
      Object.entries(names).map(([k, v]) => [Number(k), v])
    );
  }

  private async loadCollapsedWindows(): Promise<Set<number>> {
    const result = await chrome.storage.local.get('collapsed-windows');
    const collapsed = (result['collapsed-windows'] as number[]) || [];
    return new Set(collapsed);
  }

  private async saveSelection() {
    // Debounce storage writes
    if (this.saveSelectionTimeout !== null) {
      clearTimeout(this.saveSelectionTimeout);
    }
    this.saveSelectionTimeout = window.setTimeout(async () => {
      this.saveSelectionTimeout = null;
      await chrome.storage.local.set({ 'selected-tabs': Array.from(this.selectedTabIds.values()) });
    }, 500);
  }

  async setSuggestions(suggestionsByUrl: Map<string, string[]>) {
    // Update URL map with sorted suggestions
    this.suggestionsUrlMap.clear(); // Clear existing before setting new ones
    for (const [url, suggestions] of suggestionsByUrl.entries()) {
      // Sort alphabetically
      const sortedSuggestions = suggestions.sort((a, b) => a.localeCompare(b));
      this.suggestionsUrlMap.set(url, sortedSuggestions);
    }
    console.log('Updated suggestionsUrlMap:', this.suggestionsUrlMap);

    // Save to storage
    const suggestionsByUrlObj = Object.fromEntries(this.suggestionsUrlMap.entries());
    await chrome.storage.local.set({ 'tab-suggestions': suggestionsByUrlObj });
  }

  async fetchAll() {
    console.log('fetch-all')
    const [windows, tabs, groups] = await Promise.all([
      chrome.windows.getAll(),
      chrome.tabs.query({}),
      chrome.tabGroups.query({})
    ]);

    const groupMap = new Map<number, GroupNode>();

    groups.forEach(g => {
      const groupNode: GroupNode = {
        id: g.id,
        title: g.title || '',
        color: g.color,
        windowId: g.windowId,
        collapsed: g.collapsed,
        tabs: []
      };
      groupMap.set(g.id, groupNode);
    });

    const windowMap = new Map<number, WindowNode>();
    windows.forEach(w => {
      if (w.id !== undefined) {
        windowMap.set(w.id, {
          id: w.id,
          focused: w.focused,
          tabs: [],
          groups: []
        });
      }
    });

    for (const t of tabs) {
      if (t.id === undefined || t.windowId === undefined) continue;

      const suggestedGroups = t.url ? this.suggestionsUrlMap.get(t.url) : undefined;

      const tabNode: TabNode = {
        id: t.id,
        title: t.title || '',
        url: t.url || '',
        favIconUrl: t.favIconUrl,
        groupId: t.groupId,
        windowId: t.windowId,
        active: t.active || false,
        selected: this.selectedTabIds.has(t.id), // Added
        suggestedGroups // Added
      };

      if (t.groupId > -1 && groupMap.has(t.groupId)) {
        groupMap.get(t.groupId)!.tabs.push(tabNode);
      } else if (windowMap.has(t.windowId)) {
        windowMap.get(t.windowId)!.tabs.push(tabNode);
      }
    }

    // Assign groups to windows
    groupMap.forEach(g => {
      if (windowMap.has(g.windowId)) {
        windowMap.get(g.windowId)!.groups.push(g);
      }
    });

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

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      debouncedRefresh();
    });

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

    // Listen for storage changes (e.g. from background script)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes['tab-suggestions']) {
        this.loadSuggestions().then(map => {
          this.suggestionsUrlMap.clear();
          for (const [key, value] of map) this.suggestionsUrlMap.set(key, value);
          this.fetchAll();
        });
      }
      if (areaName === 'local' && changes['window-names']) {
        this.loadWindowNames().then(map => {
          this.windowNames.clear();
          for (const [key, value] of map) this.windowNames.set(key, value);
          this.fetchAll();
        });
      }
      if (areaName === 'local' && changes['collapsed-windows']) {
        this.loadCollapsedWindows().then(set => {
          this.collapsedWindowIds.clear();
          for (const id of set) this.collapsedWindowIds.add(id);
        });
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
    if (this.pendingSelectionChanges === null) {
      this.pendingSelectionChanges = new Set(this.selectedTabIds.values()); // Use .values() for SignalSet
    }

    if (type === 'tab') {
      if (selected) this.pendingSelectionChanges.add(id);
      else this.pendingSelectionChanges.delete(id);
    } else if (type === 'group') {
      const group = this.findGroup(id);
      if (group) {
        group.tabs.forEach(t => {
          if (selected) this.pendingSelectionChanges!.add(t.id);
          else this.pendingSelectionChanges!.delete(t.id);
        });
      }
    } else if (type === 'window') {
      const win = this.windows.find((w: WindowNode) => w.id === id); // Direct access
      if (win) {
        win.tabs.forEach((t: TabNode) => {
          if (selected) this.pendingSelectionChanges!.add(t.id);
          else this.pendingSelectionChanges!.delete(t.id);
        });
        win.groups.forEach((g: GroupNode) => {
          g.tabs.forEach((t: TabNode) => {
            if (selected) this.pendingSelectionChanges!.add(t.id);
            else this.pendingSelectionChanges!.delete(t.id);
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
    for (const w of this.windows) { // Direct access
      const g = w.groups.find(g => g.id === id);
      if (g) return g;
    }
    return undefined;
  }

  async closeTab(id: number) {
    await chrome.tabs.remove(id);
  }

  async focusTab(id: number) {
    const tab = await chrome.tabs.get(id);
    await chrome.tabs.update(id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  async closeGroup(id: number) {
    const group = this.findGroup(id);
    if (group) {
      const tabIds = group.tabs.map(t => t.id);
      await chrome.tabs.remove(tabIds);
    }
  }

  async moveTabToGroup(tabId: number, groupId: number) {
    const group = this.findGroup(groupId);
    const wasCollapsed = group?.collapsed;

    await chrome.tabs.group({ tabIds: tabId, groupId });

    if (wasCollapsed) {
      // Chrome automatically expands the group when a tab is added.
      // We need to re-collapse it if it was previously collapsed.
      await chrome.tabGroups.update(groupId, { collapsed: true });
    }
  }

  async createGroupForTab(tabId: number, title: string) {
    const groupId = await chrome.tabs.group({ tabIds: tabId });
    await chrome.tabGroups.update(groupId, { title });
  }

  async renameGroup(groupId: number, title: string) {
    await chrome.tabGroups.update(groupId, { title });
  }

  async collapseGroup(groupId: number, collapsed: boolean) {
    await chrome.tabGroups.update(groupId, { collapsed });
  }

  async setAllGroupsCollapsed(collapsed: boolean) {
    const updates: Promise<void>[] = [];
    this.windows.forEach((w: WindowNode) => { // Direct access
      w.groups.forEach((g: GroupNode) => {
        if (g.collapsed !== collapsed) {
          updates.push(chrome.tabGroups.update(g.id, { collapsed }) as unknown as Promise<void>);
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
    const tabs: TabNode[] = [];
    this.windows.forEach((w: WindowNode) => {
      w.tabs.forEach((t: TabNode) => {
        if (!t.suggestedGroups || t.suggestedGroups.length === 0) {
          tabs.push(t);
        }
      });
      w.groups.forEach((g: GroupNode) => {
        g.tabs.forEach((t: TabNode) => {
          if (!t.suggestedGroups || t.suggestedGroups.length === 0) {
            tabs.push(t);
          }
        });
      });
    });
    return tabs;
  }

  selectUngroupedTabs() {
    // Cancel any pending batched update
    if (this.selectionUpdateFrameId !== null) {
      cancelAnimationFrame(this.selectionUpdateFrameId);
      this.selectionUpdateFrameId = null;
      this.pendingSelectionChanges = null;
    }

    this.selectedTabIds.clear(); // Clear existing selection
    this.windows.forEach((w: WindowNode) => { // Direct access
      w.tabs.forEach((t: TabNode) => {
        this.selectedTabIds.add(t.id);
      });
    });
    console.log('Updated selectedTabIds (ungrouped):', this.selectedTabIds);
    this.saveSelection();
  }

  async clearSuggestions(tabId: number) {
    // Update storage and cache
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.id === tabId);

    if (tab?.url && this.suggestionsUrlMap.has(tab.url)) {
      this.suggestionsUrlMap.delete(tab.url);
      console.log('Cleared suggestionsUrlMap for url:', tab.url, this.suggestionsUrlMap);

      const suggestionsByUrl = Object.fromEntries(this.suggestionsUrlMap.entries());
      await chrome.storage.local.set({ 'tab-suggestions': suggestionsByUrl });
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
    await chrome.storage.local.set({ 'window-names': namesObj });

    this.fetchAll();
  }

  async setWindowCollapsed(windowId: number, collapsed: boolean) {
    if (collapsed) {
      this.collapsedWindowIds.add(windowId);
    } else {
      this.collapsedWindowIds.delete(windowId);
    }
    console.log('Updated collapsedWindowIds:', this.collapsedWindowIds);

    await chrome.storage.local.set({ 'collapsed-windows': Array.from(this.collapsedWindowIds.values()) });
  }
}

export const tabStore = new TabStore();
