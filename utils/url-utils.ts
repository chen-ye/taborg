export const normalizeUrl = (url: string): string => {
  try {
    const u = new URL(url);
    // Strip query params and hash by recomposing standard parts
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // Return original if invalid URL
    return url;
  }
};
