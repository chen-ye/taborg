import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ['sidePanel', 'tabs', 'tabGroups', 'storage'],
    action: {}, // Optional: enables the toolbar icon
  },
});
