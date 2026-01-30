export const normalizeUrl = (url: string): string => {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    // Return original if invalid URL
    return url;
  }
};
