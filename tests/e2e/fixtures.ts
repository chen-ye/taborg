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
          // Try to extract tab IDs from the prompt
          let tabIds: number[] = [];
          try {
            if (prompt.includes('Input Tabs:')) {
              const jsonPart = prompt.split('Input Tabs:')[1].split('Existing Groups:')[0].trim();
              const tabs = JSON.parse(jsonPart);
              tabIds = tabs.map((t: any) => t.id);
            } else if (prompt.includes('- ID:')) {
              // StandardLLMStrategy format
              const matches = prompt.matchAll(/- ID: (\d+),/g);
              tabIds = Array.from(matches).map((m) => Number(m[1]));
            }
          } catch (_e) {
            // Silently fail for mock
          }

          if (tabIds.length === 0) {
            tabIds = [101, 102, 103, 104];
          }

          const suggestions = tabIds.map((id) => ({
            tabId: id,
            groupNames: prompt.includes('google.com') || prompt.includes('Google') ? ['Search'] : ['General'],
          }));

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
    await use(extensionId);
  },
});

export const expect = test.expect;
