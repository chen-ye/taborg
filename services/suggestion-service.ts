export class SuggestionService {
  private readonly STORAGE_KEY = 'tab-suggestions';

  async getSuggestions(url: string): Promise<string[]> {
    const all = await this.getAllSuggestions();
    return all[url] || [];
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
      const existing = all[url] || [];
      const combined = new Set([...existing, ...newSuggestions]);
      all[url] = Array.from(combined).sort((a, b) => a.localeCompare(b));
    }
    await chrome.storage.local.set({ [this.STORAGE_KEY]: all });
  }

  async removeSuggestions(url: string): Promise<void> {
    const all = await this.getAllSuggestions();
    if (url in all) {
      delete all[url];
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
