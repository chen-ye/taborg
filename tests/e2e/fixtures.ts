import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.join(__dirname, '../../.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    // Create a unique temporary directory for each test context to ensure isolation
    const userDataDir = path.join(os.tmpdir(), `taborg-test-user-data-${Math.random().toString(36).substring(7)}`);
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Must be false for extensions
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--headless=new', // Use the modern headless mode that supports extensions
      ],
    });

    // Inject AI Mock into all pages (including offscreen)
    await context.addInitScript(() => {
      const mockSession = {
        prompt: async (prompt: string) => {
          console.log('[Mock AI] Prompt:', prompt);
          return JSON.stringify({
            suggestions: [
              { tabId: 101, groupNames: ['Search'] },
              { tabId: 102, groupNames: ['General'] },
              { tabId: 103, groupNames: ['News'] },
              { tabId: 104, groupNames: ['B'] },
            ],
          });
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

    // Clean up the temporary directory after the test
    try {
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn(`Failed to remove temporary user data dir: ${userDataDir}`, e);
    }
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

export { expect };
