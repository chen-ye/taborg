import { browserService } from '../services/browser-service.js';
import { geminiService } from '../services/gemini.js';
import { mcpService } from '../services/mcp-connection.js';
import { suggestionService } from '../services/suggestion-service.js';

export const main = () => {
  // Create offscreen document to watch for theme changes
  async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    if (existingContexts.length > 0) {
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Detect system theme changes for icon switching',
    });
  }

  chrome.runtime.onStartup.addListener(setupOffscreenDocument);
  chrome.runtime.onInstalled.addListener(setupOffscreenDocument);

  const processedTabIds = new Set<number>();
  const newTabIds = new Set<number>();

  const isNewTab = (url?: string) => {
    return (
      !url ||
      url === 'about:blank' ||
      url === 'chrome://newtab/' ||
      url === 'edge://newtab/' ||
      url.startsWith('chrome://newtab')
    );
  };

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id && (isNewTab(tab.url) || isNewTab(tab.pendingUrl))) {
      newTabIds.add(tab.id);
    }
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url && isNewTab(changeInfo.url)) {
      newTabIds.add(tabId);
    }

    // Auto-suggest logic
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
      const wasNewTab = newTabIds.has(tabId);

      // Check if opened from another tab (link) and not yet processed
      // OR if it was previously on a new tab page
      if ((tab.openerTabId || wasNewTab) && !processedTabIds.has(tabId)) {
        processedTabIds.add(tabId);

        try {
          // Get existing groups from storage to pass to Gemini
          const groupsResult = await chrome.tabGroups.query({});
          const existingGroups = groupsResult.map((g) => g.title || '').filter(Boolean);

          const suggestions = await geminiService.categorizeTabs(
            [{ id: tabId, title: tab.title || '', url: tab.url }],
            existingGroups,
          );

          if (suggestions.has(tabId)) {
            const newSuggestions = suggestions.get(tabId) || [];
            await suggestionService.setSuggestions(tab.url, newSuggestions);
          }
        } catch (e) {
          console.error('Auto-suggest failed', e);
        }
      }

      // Cleanup newTabIds for this tab as it is now navigated
      if (wasNewTab) {
        newTabIds.delete(tabId);
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    processedTabIds.delete(tabId);
    newTabIds.delete(tabId);
  });

  // Enable opening side panel on action click
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set panel behavior:', error));

  // Handle messages from offscreen document
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_ICON') {
      chrome.action.setIcon({ imageData: message.imageData });
    }
  });

  const updateBadge = async () => {
    const tabs = await chrome.tabs.query({});
    await chrome.action.setBadgeText({ text: tabs.length.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#777' });
  };

  chrome.tabs.onCreated.addListener(() => updateBadge());
  chrome.tabs.onRemoved.addListener(() => updateBadge());
  updateBadge();
  initializeMcpTools();
  initializeMcpResources();
  initializeMcpPrompts();
  mcpService.onStatusChange((status) => {
    chrome.storage.session.set({ mcpStatus: status });
    updateBadge(); // Update badge on status change too
  });

  mcpService.onErrorChange((error) => {
    chrome.storage.session.set({ mcpError: error });
  });

  // Handle MCP messages from sidepanel
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'MCP_CONNECT') {
      mcpService.setEnabled(true);
    } else if (message.type === 'MCP_DISCONNECT') {
      mcpService.setEnabled(false);
    } else if (message.type === 'MCP_RETRY') {
      mcpService.retryConnection();
    }
  });

  mcpService.init();
};

function initializeMcpPrompts() {
  mcpService.registerPrompt(
    {
      name: 'organize_tabs',
      description:
        'Instructions for organizing browser tabs into groups. The agent should read taborg://tabs and taborg://groups resources to get current state.',
      arguments: [],
    },
    async () => {
      // Load predefined groups from settings to include in instructions
      const result = await chrome.storage.sync.get('predefined-groups');
      const predefinedGroups = (result['predefined-groups'] as string[]) || [];
      const predefinedText =
        predefinedGroups.length > 0 ? `\nPredefined group names to prefer: ${predefinedGroups.join(', ')}` : '';

      const promptText = `You are a helpful assistant that organizes browser tabs.

First, read the following MCP resources to get the current state:
- taborg://tabs - List of all open tabs with IDs, titles, URLs, and group info
- taborg://groups - List of all existing tab groups with IDs, titles, and colors
${predefinedText}

After reading the resources, analyze the tabs and:
1. Suggest up to 3 group names for each tab
2. Prefer using existing group names if they fit well
3. If no existing group fits, create a new short, descriptive group name (e.g., "Dev", "News", "Social")

Then use the 'taborg_group_tabs' tool to organize tabs, or 'taborg_update_suggestions' to provide suggestions to the user.`;

      return {
        description: 'Instructions for organizing browser tabs into groups',
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: promptText },
          },
        ],
      };
    },
  );
}

function initializeMcpResources() {
  mcpService.registerResource(
    {
      uri: 'taborg://tabs',
      name: 'Open Tabs',
      description: 'List of all open browser tabs with their IDs, titles, URLs, and group information',
      mimeType: 'application/json',
    },
    async () => {
      const tabs = await browserService.getTabs({});
      const tabData = tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        windowId: t.windowId,
        groupId: t.groupId,
      }));
      return [{ uri: 'taborg://tabs', mimeType: 'application/json', text: JSON.stringify(tabData, null, 2) }];
    },
  );

  mcpService.registerResource(
    {
      uri: 'taborg://groups',
      name: 'Tab Groups',
      description: 'List of all tab groups with their IDs, titles, colors, and window information',
      mimeType: 'application/json',
    },
    async () => {
      const groups = await browserService.getGroups({});
      const groupData = groups.map((g) => ({
        id: g.id,
        title: g.title,
        color: g.color,
        windowId: g.windowId,
      }));
      return [{ uri: 'taborg://groups', mimeType: 'application/json', text: JSON.stringify(groupData, null, 2) }];
    },
  );

  mcpService.registerResource(
    {
      uri: 'taborg://windows',
      name: 'Browser Windows',
      description: 'List of all open browser windows with their dimensions and state',
      mimeType: 'application/json',
    },
    async () => {
      const windows = await browserService.getWindows();
      return [{ uri: 'taborg://windows', mimeType: 'application/json', text: JSON.stringify(windows, null, 2) }];
    },
  );
}
function initializeMcpTools() {
  mcpService.registerTool(
    {
      name: 'taborg_list_tabs',
      description: 'List all open tabs, optionally filtered by window or group',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          windowId: { type: 'number', description: 'Filter by window ID' },
          groupId: { type: 'number', description: 'Filter by group ID' },
        },
      },
    },
    async (args) => {
      const typedArgs = args as { windowId?: number; groupId?: number };
      const queryInfo: chrome.tabs.QueryInfo = {};
      if (typedArgs.windowId) queryInfo.windowId = typedArgs.windowId;
      if (typedArgs.groupId) queryInfo.groupId = typedArgs.groupId;
      const tabs = await browserService.getTabs(queryInfo);
      const result = tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        windowId: t.windowId,
        groupId: t.groupId,
      }));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_list_groups',
      description: 'List all tab groups',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          windowId: { type: 'number', description: 'Filter by window ID' },
        },
      },
    },
    async (args) => {
      const typedArgs = args as { windowId?: number };
      const queryInfo: chrome.tabGroups.QueryInfo = {};
      if (typedArgs.windowId) queryInfo.windowId = typedArgs.windowId;
      const groups = await browserService.getGroups(queryInfo);
      const result = groups.map((g) => ({ id: g.id, title: g.title, color: g.color, windowId: g.windowId }));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_group_tabs',
      description:
        'Group specific tabs together. Since the tool operates on tab IDs and group IDs, you should explain to the user what you are doing before executing the tool.',
      inputSchema: {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'number' }, description: 'List of tab IDs to group' },
          groupId: { type: 'number', description: 'Existing group ID to add to' },
          createGroupTitle: { type: 'string', description: 'Title for new group if creating one' },
        },
        required: ['tabIds'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabIds: number[]; groupId?: number; createGroupTitle?: string };
      const validTabIds = [];
      // validate tabs exist
      for (const id of typedArgs.tabIds) {
        try {
          await browserService.getTab(id);
          validTabIds.push(id);
        } catch (_e) {}
      }

      if (validTabIds.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'No valid tabs found',
            },
          ],
        };
      }

      const groupId = await browserService.groupTabs(validTabIds, typedArgs.groupId, typedArgs.createGroupTitle);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ groupId }, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_ungroup_tabs',
      description:
        'Ungroup specific tabs. Since the tool operates on tab IDs, you should explain to the user what you are doing before executing the tool.',
      inputSchema: {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'number' } },
        },
        required: ['tabIds'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabIds: number[] };
      await browserService.ungroupTabs(typedArgs.tabIds);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_move_tabs_relative',
      description:
        'Move tabs relative to another tab. Since the tool operates on tab IDs, you should explain to the user what you are doing before executing the tool.',
      inputSchema: {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'number' } },
          targetTabId: { type: 'number', description: 'Reference tab ID' },
          position: { type: 'string', enum: ['before', 'after'], description: 'Position relative to target' },
        },
        required: ['tabIds', 'targetTabId', 'position'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabIds: number[]; targetTabId: number; position: 'before' | 'after' };
      const targetTab = await browserService.getTab(typedArgs.targetTabId);
      let index = targetTab.index;
      if (typedArgs.position === 'after') {
        index += 1;
      }

      await browserService.moveTabs(typedArgs.tabIds, targetTab.windowId, index);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_close_tabs',
      annotations: { destructiveHint: true },
      description:
        'Close specific tabs. Since the tool operates on tab IDs, you should explain to the user what you are doing before executing the tool.',
      inputSchema: {
        type: 'object',
        properties: {
          tabIds: { type: 'array', items: { type: 'number' } },
        },
        required: ['tabIds'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabIds: number[] };
      await browserService.closeTabs(typedArgs.tabIds);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_update_suggestions',
      description:
        'Update category suggestions for a specific tab. Since the tool operates on tab IDs, you should explain to the user what you are doing before executing the tool.',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'The ID of the tab to update suggestions for' },
          tabSuggestions: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of suggested categories',
          },
        },
        required: ['tabId', 'tabSuggestions'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabId: number; tabSuggestions: string[] };
      const tab = await browserService.getTab(typedArgs.tabId);

      if (tab.url) {
        await suggestionService.setSuggestions(tab.url, typedArgs.tabSuggestions);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_get_suggestions',
      annotations: { readOnlyHint: true },
      description: 'Get existing category suggestions for a specific tab',
      inputSchema: {
        type: 'object',
        properties: {
          tabId: { type: 'number', description: 'The ID of the tab to get suggestions for' },
        },
        required: ['tabId'],
      },
    },
    async (args) => {
      const typedArgs = args as { tabId: number };

      try {
        const tab = await browserService.getTab(typedArgs.tabId);
        if (!tab.url) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ suggestions: [] }, null, 2) }],
          };
        }

        const suggestions = await suggestionService.getSuggestions(tab.url);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ suggestions }, null, 2),
            },
          ],
        };
      } catch (error) {
        // If tab not found or other error, return empty suggestions or error
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error getting suggestions: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_list_windows',
      annotations: { readOnlyHint: true },
      description: 'List all open browser windows',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async () => {
      const windows = await browserService.getWindows();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(windows, null, 2),
          },
        ],
      };
    },
  );

  mcpService.registerTool(
    {
      name: 'taborg_move_tab_group',
      description: 'Move a tab group to a specific window and optional index.',
      inputSchema: {
        type: 'object',
        properties: {
          groupId: { type: 'number', description: 'The ID of the group to move' },
          windowId: { type: 'number', description: 'The target window ID' },
          index: { type: 'number', description: 'Optional index in the target window' },
        },
        required: ['groupId', 'windowId'],
      },
    },
    async (args) => {
      const typedArgs = args as { groupId: number; windowId: number; index?: number };
      await browserService.moveGroup(typedArgs.groupId, typedArgs.windowId, typedArgs.index ?? -1);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );
}

export default defineBackground(main);
