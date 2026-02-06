import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.join(__dirname, '../../.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // Allows headless execution as per guide
      headless: true,
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
    });

    // Inject AI Mock into all pages (including offscreen)
    await context.addInitScript(() => {
      const mockSession = {
        prompt: async (prompt: string) => {
          console.log('[Mock AI] Prompt:', prompt);

          // Parse the prompt to extract tab IDs
          // The prompt format in ChromeAIService is:
          // Input Tabs:
          // [{"id":...,"title":...,"url":...}]

          let suggestions: any[] = [];

          try {
            const inputTabsMatch = prompt.match(/Input Tabs:\s*(\[.*?\])/s);
            if (inputTabsMatch && inputTabsMatch[1]) {
              const tabs = JSON.parse(inputTabsMatch[1]);
              suggestions = tabs.map((t: any) => ({
                tabId: t.id,
                groupNames: ['Search'], // Return 'Search' for all tabs to match test expectation
              }));
            } else {
              // Fallback or other prompt types (e.g. similarity)
              // For similarity, we might need other logic, but grouping test cares about this.
              suggestions = [];
            }
          } catch (e) {
            console.error('[Mock AI] Failed to parse prompt:', e);
          }

          if (suggestions.length === 0) {
            // Fallback for non-categorization prompts or failure
            return JSON.stringify({ suggestions: [] });
          }

          return JSON.stringify({ suggestions });
        },
        destroy: () => {},
      };

      (window as any).LanguageModel = {
        availability: async () => 'available',
        create: async () => mockSession,
      };

      (window as any).ai = {
        languageModel: (window as any).LanguageModel,
      };
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // Wait for the Manifest V3 Service Worker to initialize
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');

    // Extract ID from the worker URL (chrome-extension://<id>/...)
    const extensionId = background.url().split('/')[2];

    // Force 'chrome-ai' provider for tests so we use the mock
    await background.evaluate(() => {
      chrome.storage.sync.set({ 'active-llm-provider': 'chrome-ai' });
    });

    await use(extensionId);
  },
});

export const expect = test.expect;
