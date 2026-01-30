import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon-light.svg',
    grayscaleOnDevelopment: false,
  },
  manifest: {
    permissions: ['sidePanel', 'tabs', 'tabGroups', 'storage', 'offscreen', 'identity'],
    action: {}, // Optional: enables the toolbar icon
  },
  vite: () => ({
    build: {
      sourcemap: true,
    },
  }),
});
