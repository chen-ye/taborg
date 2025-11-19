const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

function updateIcon(isDark: boolean) {
  chrome.runtime.sendMessage({
    type: 'UPDATE_ICON',
    theme: isDark ? 'dark' : 'light'
  });
}

// Initial check
updateIcon(mediaQuery.matches);

// Listen for changes
mediaQuery.addEventListener('change', (e) => {
  updateIcon(e.matches);
});
