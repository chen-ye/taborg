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
      url: 'entrypoints/offscreen.html',
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Detect system theme changes for icon switching',
    });
  }

  chrome.runtime.onStartup.addListener(setupOffscreenDocument);
  chrome.runtime.onInstalled.addListener(setupOffscreenDocument);

  // Handle messages from offscreen document
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_ICON') {
      const isDark = message.theme === 'dark';
      // In dark mode, use the light icon (white). In light mode, use the dark icon (black).
      const iconPath = isDark ? 'icon/dark' : 'icon/light';

      // We need to map the generated paths from auto-icons
      // auto-icons generates icons in standard sizes.
      // However, we need to know where the *other* variant is.
      // Since auto-icons only generates one set based on config, we might need to manually
      // point to our assets or rely on auto-icons generating both?
      // Actually, auto-icons only generates one set for the manifest.
      // We need to manually generate or reference the other set.
      // But wait, we can't easily generate the *other* set with auto-icons in the same build
      // unless we have multiple configs or just manually reference the SVGs?
      // chrome.action.setIcon can take an SVG path? No, it takes ImageData or path to PNGs.
      // Chrome supports SVG in setIcon!

      // Let's try setting the SVG directly.
      const path = isDark ? 'assets/icon-dark.svg' : 'assets/icon-light.svg';

      // Note: setIcon with SVG path might not work in all browsers/versions,
      // but it works in modern Chrome.
      // Alternatively, we can use the canvas in offscreen to generate ImageData.
      // But let's try the path first.

      chrome.action.setIcon({ path: path });
    }
  });
});
