import { ReactiveController, ReactiveControllerHost } from 'lit';

export interface TabNode {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  groupId: number;
  windowId: number;
  selected: boolean;
  active: boolean;
  suggestedGroups?: string[];
}

export interface GroupNode {
  id: number;
  title: string;
  color: string;
  windowId: number;
  collapsed: boolean;
  tabs: TabNode[];
  selected: boolean;
}

export interface WindowNode {
  id: number;
  name?: string;
  focused: boolean;
  tabs: TabNode[]; // Ungrouped tabs
  groups: GroupNode[];
  selected: boolean;
}

class TabStore {
  private listeners: (() => void)[] = [];

  windows: WindowNode[] = [];
  selectedTabIds: Set<number> = new Set();
  suggestions: Map<number, string[]> = new Map();
  suggestionsUrlMap: Map<string, string[]> = new Map();
  groupsByName: Map<string, GroupNode> = new Map();
  windowNames: Map<number, string> = new Map();

  constructor() {
    this.init();
  }

  private async init() {
    await Promise.all([
      this.loadSuggestions(),
      this.loadSelection(),
      this.loadWindowNames()
    ]);
    await this.fetchAll();
    this.setupListeners();
  }

  private async loadSuggestions() {
    const result = await chrome.storage.local.get('tab-suggestions');
    const suggestionsByUrl = (result['tab-suggestions'] as Record<string, string[]>) || {};
    this.suggestionsUrlMap = new Map(Object.entries(suggestionsByUrl));
  }

  private async loadSelection() {
    const result = await chrome.storage.local.get('selected-tabs');
    const selected = (result['selected-tabs'] as number[]) || [];
    this.selectedTabIds = new Set(selected);
  }

  private async loadWindowNames() {
    const result = await chrome.storage.local.get('window-names');
    const names = (result['window-names'] as Record<string, string>) || {};
    // Convert string keys back to numbers
    this.windowNames = new Map(
      Object.entries(names).map(([k, v]) => [Number(k), v])
    );
  }

  private async saveSelection() {
    await chrome.storage.local.set({ 'selected-tabs': Array.from(this.selectedTabIds) });
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l());
  }

  async setSuggestions(map: Map<number, string[]>) {
    // Update in-memory map for current tabs
    for (const [key, value] of Array.from(map.entries())) {
      this.suggestions.set(key, value);
    }

    // Update URL map and storage
    const tabs = await chrome.tabs.query({});
    for (const [tabId, suggestions] of Array.from(map.entries())) {
      const tab = tabs.find(t => t.id === tabId);
      if (tab?.url) {
        this.suggestionsUrlMap.set(tab.url, suggestions);
      }
    }

    // Save to storage
    const suggestionsByUrl = Object.fromEntries(this.suggestionsUrlMap);
    await chrome.storage.local.set({ 'tab-suggestions': suggestionsByUrl });

    this.fetchAll();
  }

  async fetchAll() {
    const [windows, tabs, groups] = await Promise.all([
      chrome.windows.getAll(),
      chrome.tabs.query({}),
      chrome.tabGroups.query({})
    ]);

    const groupMap = new Map<number, GroupNode>();
    this.groupsByName.clear();

    groups.forEach(g => {
      const groupNode: GroupNode = {
        id: g.id,
        title: g.title || '',
        color: g.color,
        windowId: g.windowId,
        collapsed: g.collapsed,
        tabs: [],
        selected: false
      };
      groupMap.set(g.id, groupNode);
      if (g.title) {
        this.groupsByName.set(g.title, groupNode);
      }
    });

    const windowMap = new Map<number, WindowNode>();
    windows.forEach(w => {
      if (w.id) {
        windowMap.set(w.id, {
          id: w.id,
          name: this.windowNames.get(w.id),
          focused: w.focused,
          tabs: [],
          groups: [],
          selected: false
        });
      }
    });

    for (const t of tabs) {
      if (!t.id || !t.windowId) continue;

      // Use cached suggestions (synchronous)
      const suggestedGroups = this.suggestions.get(t.id) || (t.url ? this.suggestionsUrlMap.get(t.url) : undefined);

      const tabNode: TabNode = {
        id: t.id,
        title: t.title || '',
        url: t.url || '',
        favIconUrl: t.favIconUrl,
        groupId: t.groupId,
        windowId: t.windowId,
        selected: this.selectedTabIds.has(t.id),
        active: t.active || false,
        suggestedGroups
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

    this.windows = Array.from(windowMap.values());
    this.notify();
  }

  setupListeners() {
    const refresh = () => this.fetchAll();

    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onMoved.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onAttached.addListener(refresh);
    chrome.tabs.onDetached.addListener(refresh);

    chrome.tabGroups.onCreated.addListener(refresh);
    chrome.tabGroups.onUpdated.addListener(refresh);
    chrome.tabGroups.onMoved.addListener(refresh);
    chrome.tabGroups.onRemoved.addListener(refresh);

    chrome.windows.onCreated.addListener(refresh);
    chrome.windows.onRemoved.addListener(refresh);
    chrome.windows.onFocusChanged.addListener(refresh);
  }

  toggleSelection(id: number, type: 'tab' | 'group' | 'window', selected: boolean) {
    const newSelection = new Set(this.selectedTabIds);

    if (type === 'tab') {
      if (selected) newSelection.add(id);
      else newSelection.delete(id);
    } else if (type === 'group') {
      const group = this.findGroup(id);
      if (group) {
        group.tabs.forEach(t => {
          if (selected) newSelection.add(t.id);
          else newSelection.delete(t.id);
        });
      }
    } else if (type === 'window') {
      const win = this.windows.find(w => w.id === id);
      if (win) {
        win.tabs.forEach(t => {
          if (selected) newSelection.add(t.id);
          else newSelection.delete(t.id);
        });
        win.groups.forEach(g => {
          g.tabs.forEach(t => {
            if (selected) newSelection.add(t.id);
            else newSelection.delete(t.id);
          });
        });
      }
    }

    this.selectedTabIds = newSelection;
    this.saveSelection();
    this.notify(); // Immediate UI update
    this.fetchAll(); // Re-build tree with new selection state
  }

  setSelectedTabs(ids: Set<number>) {
    this.selectedTabIds = new Set(ids);
    this.saveSelection();
    this.notify();
    this.fetchAll();
  }

  findGroup(id: number): GroupNode | undefined {
    for (const w of this.windows) {
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
    this.windows.forEach(w => {
      w.groups.forEach(g => {
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
    const selected: TabNode[] = [];
    this.windows.forEach(w => {
      w.tabs.forEach(t => {
        if (this.selectedTabIds.has(t.id)) selected.push(t);
      });
      w.groups.forEach(g => {
        g.tabs.forEach(t => {
          if (this.selectedTabIds.has(t.id)) selected.push(t);
        });
      });
    });
    return selected;
  }

  selectUngroupedTabs() {
    const newSelection = new Set<number>();
    this.windows.forEach(w => {
      w.tabs.forEach(t => {
        newSelection.add(t.id);
      });
    });
    this.selectedTabIds = newSelection;
    this.saveSelection();
    this.notify();
    this.fetchAll();
  }

  async clearSuggestions(tabId: number) {
    if (this.suggestions.has(tabId)) {
      this.suggestions.delete(tabId);

      // Update storage and cache
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.id === tabId);

      if (tab?.url && this.suggestionsUrlMap.has(tab.url)) {
        this.suggestionsUrlMap.delete(tab.url);
        const suggestionsByUrl = Object.fromEntries(this.suggestionsUrlMap);
        await chrome.storage.local.set({ 'tab-suggestions': suggestionsByUrl });
      }

      this.fetchAll();
    }
  }

  getGroupByName(name: string): GroupNode | undefined {
    return this.groupsByName.get(name);
  }

  getAllGroups(): GroupNode[] {
    return Array.from(this.groupsByName.values());
  }

  async setWindowName(windowId: number, name: string) {
    this.windowNames.set(windowId, name);

    // Save to storage
    const namesObj = Object.fromEntries(this.windowNames);
    await chrome.storage.local.set({ 'window-names': namesObj });

    this.fetchAll();
  }
}

export const tabStore = new TabStore();

export class TabStoreController implements ReactiveController {
  host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    this.unsubscribe = tabStore.subscribe(() => this.host.requestUpdate());
  }

  hostDisconnected() {
    this.unsubscribe?.();
  }

  private unsubscribe?: () => void;
}
