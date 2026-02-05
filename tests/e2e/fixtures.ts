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
      headless: true, // Remains headless for CI, but configured for extension
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`, '--headless=new'],
    });

    // Inject AI Mock into all pages (including offscreen)
    await context.addInitScript(() => {
      // Mock for Chrome Prompt API / LanguageModel
      const mockSession = {
        prompt: async (prompt: string) => {
          console.log('[Mock AI] Received prompt:', prompt);
          // Deterministic responses based on prompt content
          if (prompt.includes('google.com')) {
            return JSON.stringify({
              suggestions: [{ tabId: 101, groupNames: ['Search'] }],
            });
          }
          if (prompt.includes('news.com')) {
            return JSON.stringify({
              suggestions: [{ tabId: 103, groupNames: ['News'] }],
            });
          }
          return JSON.stringify({ suggestions: [] });
        },
        destroy: () => {},
      };

      // User identifies window.LanguageModel as the modern API
      (window as any).LanguageModel = {
        availability: async () => 'available',
        create: async () => mockSession,
      };

      // Maintain window.ai.languageModel as legacy/backup if needed
      (window as any).ai = {
        languageModel: (window as any).LanguageModel,
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