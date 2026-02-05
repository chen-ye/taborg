import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.join(__dirname, '../../.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--headless=new',
      ],
    });

    // Inject mock into all frames
    await context.addInitScript(() => {
      const mockSession = {
        prompt: async (prompt: string) => {
          console.log('[Mock AI] Prompt:', prompt);
          return JSON.stringify({
            suggestions: [
              { tabId: 101, groupNames: ['Search'] },
              { tabId: 102, groupNames: ['General'] },
              { tabId: 103, groupNames: ['News'] },
              { tabId: 104, groupNames: ['B'] }
            ]
          });
        },
        destroy: () => {}
      };

      (window as any).LanguageModel = {
        availability: async () => 'available',
        create: async () => mockSession
      };
      
      (window as any).ai = {
        languageModel: (window as any).LanguageModel
      };
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export { expect };