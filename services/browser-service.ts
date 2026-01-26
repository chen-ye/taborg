export interface TabInfo {
  id: number;
  title: string;
  url: string;
  windowId: number;
  groupId: number;
  index: number;
  active: boolean;
  favIconUrl?: string;
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

export function assertNonEmptyArray<T>(arr: T[]): asserts arr is [T, ...T[]] {
  if (arr.length === 0) {
    throw new Error('Array cannot be empty');
  }
}

export class BrowserService {
  async getTabs(query: chrome.tabs.QueryInfo = {}): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query(query);
    return tabs.map((t) => ({
      id: t.id!,
      title: t.title || '',
      url: t.url || '',
      windowId: t.windowId,
      groupId: t.groupId,
      index: t.index,
      active: t.active,
      favIconUrl: t.favIconUrl,
    }));
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
    return windows.map((w) => ({
      id: w.id!,
      focused: w.focused,
      state: w.state,
      type: w.type,
      width: w.width,
      height: w.height,
      top: w.top,
      left: w.left,
      name: windowNames[w.id!] || undefined,
    }));
  }

  async setWindowName(windowId: number, name: string) {
    const names = await this.getWindowNames();
    names[windowId] = name;
    await chrome.storage.local.set({ 'window-names': names });
  }

  private async getWindowNames(): Promise<Record<number, string>> {
    const result = await chrome.storage.local.get('window-names');
    return (result['window-names'] as Record<number, string>) || {};
  }

  async getTab(tabId: number): Promise<TabInfo> {
    const t = await chrome.tabs.get(tabId);
    return {
      id: t.id!,
      title: t.title || '',
      url: t.url || '',
      windowId: t.windowId,
      groupId: t.groupId,
      index: t.index,
      active: t.active,
      favIconUrl: t.favIconUrl,
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

    // If adding to an existing group, ensure tabs are in the same window
    let wasCollapsed = false;
    if (groupId) {
      const group = await this.getGroup(groupId);
      wasCollapsed = group.collapsed;
      for (const tabId of tabIds) {
        const tab = await this.getTab(tabId);
        if (tab.windowId !== group.windowId) {
          await chrome.tabs.move(tabId, { windowId: group.windowId, index: -1 });
        }
      }
    }

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

  async focusTab(tabId: number) {
    const tab = await this.getTab(tabId);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  async updateGroup(groupId: number, updateInfo: chrome.tabGroups.UpdateProperties) {
    await chrome.tabGroups.update(groupId, updateInfo);
  }

  async moveGroup(groupId: number, windowId: number, index: number = -1) {
    await chrome.tabGroups.move(groupId, { windowId, index });
  }
}

export const browserService = new BrowserService();
