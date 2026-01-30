import { normalizeUrl } from '../../utils/url-utils.js';

export class SuggestionService {
  private readonly STORAGE_KEY = 'tab-suggestions';

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
    await this.setAllSuggestions({ [url]: suggestions });
  }

  async setAllSuggestions(map: Record<string, string[]>): Promise<void> {
    const all = await this.getAllSuggestions();
    // Merge new map into existing suggestions with deduplication
    for (const [url, newSuggestions] of Object.entries(map)) {
      const normalized = normalizeUrl(url);
      const existing = all[normalized] || [];
      const combined = new Set([...existing, ...newSuggestions]);
      all[normalized] = Array.from(combined).sort((a, b) => a.localeCompare(b));
    }
    await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
  }

  async removeSuggestions(url: string): Promise<void> {
    const all = await this.getAllSuggestions();
    const normalized = normalizeUrl(url);
    if (normalized in all) {
      delete all[normalized];
      await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
    }
  }

  async pruneSuggestions(activeUrls: string[]): Promise<void> {
    const all = await this.getAllSuggestions();
    const activeNormalized = new Set(activeUrls.map((u) => normalizeUrl(u)));
    let changed = false;

    for (const storedUrl of Object.keys(all)) {
      if (!activeNormalized.has(storedUrl)) {
        delete all[storedUrl];
        changed = true;
      }
    }

    if (changed) {
      console.log('Pruned suggestions');
      await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
    }
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
