import { llmManager } from '../services/ai/llm-manager.js';
import { McpConnectionService, mcpService } from '../services/mcp/mcp-connection.js';
import { browserService } from '../services/tabs/browser-service.js';
import { suggestionService } from '../services/tabs/suggestion-service.js';
import type { AutoCategorizationMode } from '../types/llm-types.js';
import { MessageTypes } from '../utils/message-types.js';

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
  let autoCategorizationMode: AutoCategorizationMode = 'initial';
  let updateCounter = 0;
  const PRUNE_INTERVAL = 50;

  // Load initial settings
  chrome.storage.sync.get('auto-categorization-mode').then((result) => {
    if (result['auto-categorization-mode']) {
      autoCategorizationMode = result['auto-categorization-mode'] as AutoCategorizationMode;
    }
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes['auto-categorization-mode']) {
      autoCategorizationMode = changes['auto-categorization-mode'].newValue as AutoCategorizationMode;
    }
  });

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
    // Increment update counter for pruning
    updateCounter++;
    if (updateCounter >= PRUNE_INTERVAL) {
      updateCounter = 0;
      // Prune asynchronously without awaiting
      chrome.tabs.query({}).then((tabs) => {
        const activeUrls = tabs.map((t) => t.url || '').filter((u) => u.startsWith('http'));
        suggestionService.pruneSuggestions(activeUrls).catch((err) => console.error('Pruning failed:', err));
      });
    }

    if (isNewTab(changeInfo.url) || isNewTab(tab.url)) {
      newTabIds.add(tabId);
    }

    // Auto-suggest logic
    if (autoCategorizationMode !== 'off' && changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
      const wasNewTab = newTabIds.has(tabId);
      const isProcessed = processedTabIds.has(tabId);

      // Skip if suggestions already exist
      const existing = await suggestionService.getSuggestions(tab.url);
      if (existing.length > 0) {
        // If it was a new tab, we still want to clean up newTabIds
        if (wasNewTab) {
          newTabIds.delete(tabId);
        }
        return;
      }

      let shouldProcess = false;

      if (autoCategorizationMode === 'always') {
        shouldProcess = true;
      } else {
        // 'initial' mode: process only if opened from another tab and not yet processed
        if ((tab.openerTabId || wasNewTab) && !isProcessed) {
          shouldProcess = true;
        }
      }

      if (shouldProcess) {
        processedTabIds.add(tabId);
        console.log(`[Auto-Categories] Processing tab ${tabId}`, {
          url: tab.url,
          wasNewTab,
          opener: tab.openerTabId,
          mode: autoCategorizationMode,
        });

        // Set processing state in session storage
        try {
          const result = await chrome.storage.session.get('processing-tabs');
          const currentList = new Set((result['processing-tabs'] as number[]) || []);
          currentList.add(tabId);
          await chrome.storage.session.set({ 'processing-tabs': Array.from(currentList) });
        } catch (e) {
          console.error('Failed to set processing state', e);
        }

        try {
          // Get existing groups from storage to pass to LLM
          const groupsResult = await chrome.tabGroups.query({});
          const existingGroups = groupsResult.map((g) => g.title || '').filter(Boolean);

          const suggestions = await llmManager.categorizeTabs(
            [{ id: tabId, title: tab.title || '', url: tab.url }],
            existingGroups,
          );

          if (suggestions.has(tabId)) {
            const newSuggestions = suggestions.get(tabId) || [];
            // Use normalized URL is handled inside suggestionService
            await suggestionService.setSuggestions(tab.url, newSuggestions);
            console.log(`[Auto-Categories] Set suggestions for ${tabId}:`, newSuggestions);
          }
        } catch (e) {
          console.error('Auto-suggest failed', e);
        } finally {
          // Clear processing state
          try {
            const result = await chrome.storage.session.get('processing-tabs');
            const currentList = new Set((result['processing-tabs'] as number[]) || []);
            currentList.delete(tabId);
            await chrome.storage.session.set({ 'processing-tabs': Array.from(currentList) });
          } catch (e) {
            console.error('Failed to clear processing state', e);
          }
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
    if (message.type === MessageTypes.UPDATE_ICON && message.imageData) {
      // Reconstruct ImageData to ensure it's a valid object after message passing
      try {
        const { width, height, data } = message.imageData;
        const array = new Uint8ClampedArray(data);
        const imageData = new ImageData(array, width, height);
        chrome.action.setIcon({ imageData });
      } catch (e) {
        console.error('Failed to set icon:', e);
      }
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

  McpConnectionService.getPersistedInstanceId().then((instanceId) => {
    initializeMcpTools();
    initializeMcpResources(instanceId);
    initializeMcpPrompts(instanceId);
    mcpService.init();
  });

  // Re-register resources when instance ID changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes['mcp-instance-id']) {
      const newId = await McpConnectionService.getPersistedInstanceId();
      mcpService.clearRegistrations();
      initializeMcpTools();
      initializeMcpResources(newId);
      initializeMcpPrompts(newId);
      // Connection retry is handled by mcp-connection.ts
    }
  });

  mcpService.onStatusChange((status) => {
    chrome.storage.session.set({ mcpStatus: status });
    updateBadge(); // Update badge on status change too
  });

  mcpService.onErrorChange((error) => {
    chrome.storage.session.set({ mcpError: error });
  });

  // Handle MCP messages from sidepanel
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MessageTypes.MCP_CONNECT) {
      mcpService.setEnabled(true);
    } else if (message.type === MessageTypes.MCP_DISCONNECT) {
      mcpService.setEnabled(false);
    } else if (message.type === MessageTypes.MCP_RETRY) {
      mcpService.retryConnection();
    }
  });

  // init called in the promise chain above
};

function initializeMcpPrompts(instanceId: string) {
  const resourceBase = `taborg://${instanceId}`;
  mcpService.registerPrompt(
    {
      name: 'organize_tabs',
      description: `Instructions for organizing browser tabs into groups. The agent should read ${resourceBase}/tabs and ${resourceBase}/groups resources to get current state.`,
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
- ${resourceBase}/tabs - List of all open tabs with IDs, titles, URLs, and group info
- ${resourceBase}/groups - List of all existing tab groups with IDs, titles, and colors
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

function initializeMcpResources(instanceId: string) {
  mcpService.registerResource(
    {
      uri: `taborg://${instanceId}/tabs`,
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
      return [
        { uri: `taborg://${instanceId}/tabs`, mimeType: 'application/json', text: JSON.stringify(tabData, null, 2) },
      ];
    },
  );

  mcpService.registerResource(
    {
      uri: `taborg://${instanceId}/groups`,
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
      return [
        {
          uri: `taborg://${instanceId}/groups`,
          mimeType: 'application/json',
          text: JSON.stringify(groupData, null, 2),
        },
      ];
    },
  );

  mcpService.registerResource(
    {
      uri: `taborg://${instanceId}/windows`,
      name: 'Browser Windows',
      description: 'List of all open browser windows with their dimensions and state',
      mimeType: 'application/json',
    },
    async () => {
      const windows = await browserService.getWindows();
      return [
        { uri: `taborg://${instanceId}/windows`, mimeType: 'application/json', text: JSON.stringify(windows, null, 2) },
      ];
    },
  );
}
function initializeMcpTools() {
  // Tools remain unchanged as they are scoped by valid server connection
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
      name: 'taborg_set_window_name',
      description:
        'Set a custom name for a specific window. This name is stored in local storage and synchronized with the Sidepanel UI.',
      inputSchema: {
        type: 'object',
        properties: {
          windowId: { type: 'number', description: 'The ID of the window to name' },
          name: { type: 'string', description: 'The new name for the window' },
        },
        required: ['windowId', 'name'],
      },
    },
    async (args) => {
      const typedArgs = args as { windowId: number; name: string };
      await browserService.setWindowName(typedArgs.windowId, typedArgs.name);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, windowId: typedArgs.windowId, name: typedArgs.name }, null, 2),
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
