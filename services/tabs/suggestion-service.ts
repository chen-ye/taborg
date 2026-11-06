import { StorageKeys } from '../../utils/storage-keys.js';
import { normalizeUrl } from '../../utils/url-utils.js';

export class SuggestionService {
  private readonly STORAGE_KEY = StorageKeys.Local.TAB_SUGGESTIONS;

  async getSuggestions(url: string): Promise<string[]> {
    const all = await this.getAllSuggestions();
    const normalized = normalizeUrl(url);
    return all[normalized] || [];
  }

  async getAllSuggestions(): Promise<Record<string, string[]>> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return (result[this.STORAGE_KEY] as Record<string, string[]>) || {};
  }

  async setSuggestions(url: string, suggestions: string[]): Promise<void> {
    await this.mergeAllSuggestions({ [url]: suggestions });
  }

  private mergeQueue = Promise.resolve();

  async setAllSuggestions(map: Record<string, string[]>): Promise<void> {
    // Also chain full sets to ensure they don't race with merges
    const task = async () => {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: map });
    };
    const result = this.mergeQueue.then(task);
    this.mergeQueue = result.catch(() => {});
    return result;
  }

  async mergeAllSuggestions(map: Record<string, string[]>): Promise<void> {
    const task = async () => {
      const all = await this.getAllSuggestions();
      // Merge new map into existing suggestions with deduplication
      for (const [url, newSuggestions] of Object.entries(map)) {
        const normalized = normalizeUrl(url);
        const existing = all[normalized] || [];
        const combined = new Set([...existing, ...newSuggestions]);
        all[normalized] = Array.from(combined).sort((a, b) => a.localeCompare(b));
      }
      await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
    };

    const result = this.mergeQueue.then(task);
    this.mergeQueue = result.catch(() => {});
    return result;
  }

  async removeSuggestions(url: string): Promise<void> {
    const all = await this.getAllSuggestions();
    const normalized = normalizeUrl(url);
    if (normalized in all) {
      delete all[normalized];
      await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
    }
  }

  pruneSuggestions(
    currentMap: Record<string, string[]>,
    activeUrls: string[],
    maxEntries = 500,
  ): Record<string, string[]> {
    const activeNormalized = new Set(activeUrls.map((u) => normalizeUrl(u)));
    const newMap: Record<string, string[]> = {};
    const otherKeys: string[] = [];

    // 1. Keep all active URLs
    for (const url of Object.keys(currentMap)) {
      if (activeNormalized.has(url)) {
        newMap[url] = currentMap[url];
      } else {
        otherKeys.push(url);
      }
    }

    // 2. Keep recently used inactive URLs up to limit
    // Since we don't have timestamps, we'll rely on insertion order (Object.keys usually preserves it)
    // We'll take the *last* N keys (most recently added)
    const remainingSlots = maxEntries - Object.keys(newMap).length;
    if (remainingSlots > 0) {
      const retainedInactive = otherKeys.slice(-remainingSlots);
      for (const url of retainedInactive) {
        newMap[url] = currentMap[url];
      }
    }

    return newMap;
  }

  onChanged(callback: (map: Record<string, string[]>) => void): () => void {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes[this.STORAGE_KEY]) {
        callback((changes[this.STORAGE_KEY].newValue as Record<string, string[]>) || {});
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
}

export const suggestionService = new SuggestionService();
