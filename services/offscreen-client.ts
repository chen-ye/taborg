const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

async function updateIcon(isDark: boolean) {
  const iconName = isDark ? 'icon-dark.svg' : 'icon-light.svg';
  const url = chrome.runtime.getURL(iconName);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch icon: ${response.statusText}`);

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, { resizeWidth: 128, resizeHeight: 128 });

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, 128, 128);

    chrome.runtime.sendMessage({
      type: 'UPDATE_ICON',
      imageData: { '128': imageData }
    });
  } catch (error) {
    console.error('Failed to generate icon:', error);
  }
}

// Initial check
updateIcon(mediaQuery.matches);

// Listen for changes
mediaQuery.addEventListener('change', (e) => {
  updateIcon(e.matches);
});
