import { geminiService } from '../services/gemini.js';

export const main = () => {
  let creatingOffscreen = false;

  // Create offscreen document to watch for theme changes
  async function setupOffscreenDocument() {
    if (creatingOffscreen) return;
    creatingOffscreen = true;

    try {
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
    } catch (error) {
      // Ignore error if document was created concurrently
      if (!String(error).includes('Only one offscreen document may be active at a time')) {
        console.error('Failed to create offscreen document:', error);
      }
    } finally {
      creatingOffscreen = false;
    }
  }

  // Initialize offscreen document
  setupOffscreenDocument();
  chrome.runtime.onStartup.addListener(setupOffscreenDocument);
  chrome.runtime.onInstalled.addListener(setupOffscreenDocument);

  const processedTabIds = new Set<number>();
  const newTabIds = new Set<number>();

  const isNewTab = (url?: string) => {
    return !url || url === 'about:blank' || url === 'chrome://newtab/' || url === 'edge://newtab/' || url.startsWith('chrome://newtab');
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
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set panel behavior:', error));

  // Handle messages from offscreen document
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_ICON') {
      chrome.action.setIcon({ imageData: message.imageData });
    }
  });
};

export default defineBackground(main);
