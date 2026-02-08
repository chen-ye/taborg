import { StorageKeys } from '../../utils/storage-keys.js';

export class ProcessingStateService {
  private readonly STORAGE_KEY = StorageKeys.Session.PROCESSING_TABS;
  private updateQueue = Promise.resolve();

  async getProcessingTabs(): Promise<Set<number>> {
    const result = await chrome.storage.session.get(this.STORAGE_KEY);
    return new Set((result[this.STORAGE_KEY] as number[]) || []);
  }

  async addTabs(tabIds: number[]): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      const current = await this.getProcessingTabs();
      for (const id of tabIds) {
        current.add(id);
      }
      await chrome.storage.session.set({ [this.STORAGE_KEY]: Array.from(current) });
    });
    return this.updateQueue;
  }

  async removeTabs(tabIds: number[]): Promise<void> {
    this.updateQueue = this.updateQueue.then(async () => {
      const current = await this.getProcessingTabs();
      for (const id of tabIds) {
        current.delete(id);
      }
      await chrome.storage.session.set({ [this.STORAGE_KEY]: Array.from(current) });
    });
    return this.updateQueue;
  }
}

export const processingStateService = new ProcessingStateService();
