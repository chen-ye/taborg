import { geminiService } from '../services/gemini.js';

export default defineBackground(() => {
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

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Auto-suggest logic
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
      // Check if opened from another tab (link) and not yet processed
      if (tab.openerTabId && !processedTabIds.has(tabId)) {
        processedTabIds.add(tabId);

        try {
          // Get existing groups from storage to pass to Gemini
          const groupsResult = await chrome.tabGroups.query({});
          const existingGroups = groupsResult.map(g => g.title || '').filter(Boolean);

          const suggestions = await geminiService.categorizeTabs(
            [{ id: tabId, title: tab.title || '', url: tab.url }],
            existingGroups
          );

          if (suggestions.has(tabId)) {
            const newSuggestions = suggestions.get(tabId)!;

            // Update storage
            const result = await chrome.storage.local.get('tab-suggestions');
            const suggestionsByUrl = (result['tab-suggestions'] as Record<string, string[]>) || {};

            suggestionsByUrl[tab.url] = newSuggestions;

            await chrome.storage.local.set({ 'tab-suggestions': suggestionsByUrl });
          }
        } catch (e) {
          console.error('Auto-suggest failed', e);
        }
      }
    }
  });

  // Enable opening side panel on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set panel behavior:', error));

  // Handle messages from offscreen document
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_ICON') {
      chrome.action.setIcon({ imageData: message.imageData });
    }
  });
});
