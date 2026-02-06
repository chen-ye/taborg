import type { LLMService, TabData } from '../../types/llm-types';
import { chromeAIService } from './chrome-ai-service';
import { geminiService } from './gemini';
import { openAIService } from './openai';

export type LLMProvider = 'gemini' | 'chrome-ai' | 'openai';

export class LLMManager implements LLMService {
  private activeProvider: LLMProvider = 'chrome-ai';
  private fallbackEnabled = false;

  constructor() {
    this.loadSettings();
    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private async loadSettings() {
    const result = await chrome.storage.sync.get(['active-llm-provider', 'llm-fallback-enabled']);
    this.activeProvider = (result['active-llm-provider'] as LLMProvider) || 'chrome-ai';
    this.fallbackEnabled = result['llm-fallback-enabled'] === true;
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'sync') {
      if (changes['active-llm-provider']) {
        this.activeProvider = changes['active-llm-provider'].newValue as LLMProvider;
      }
      if (changes['llm-fallback-enabled']) {
        this.fallbackEnabled = changes['llm-fallback-enabled'].newValue as boolean;
      }
    }
  };

  private getService(provider: LLMProvider): LLMService {
    switch (provider) {
      case 'chrome-ai':
        return chromeAIService;
      case 'openai':
        return openAIService;
      case 'gemini':
      default:
        return geminiService;
    }
  }

  async isAvailable(): Promise<boolean> {
    const activeAvailable = await this.getService(this.activeProvider).isAvailable();
    if (activeAvailable) return true;
    if (this.fallbackEnabled && this.activeProvider !== 'chrome-ai') {
      return chromeAIService.isAvailable();
    }
    return false;
  }

  private async executeWithFallback<T>(
    operation: (service: LLMService) => Promise<T>,
    fallbackOperation: (service: LLMService) => Promise<T>,
  ): Promise<T> {
    try {
      const service = this.getService(this.activeProvider);
      const available = await service.isAvailable();
      if (!available) throw new Error(`${this.activeProvider} not available`);
      return await operation(service);
    } catch (error) {
      if (this.fallbackEnabled && this.activeProvider !== 'chrome-ai') {
        console.warn('Primary LLM failed, attempting fallback to Chrome AI', error);
        const fallbackService = chromeAIService;
        if (await fallbackService.isAvailable()) {
          return await fallbackOperation(fallbackService);
        }
      }
      throw error;
    }
  }

  async categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>> {
    return this.executeWithFallback(
      (s) => s.categorizeTabs(tabs, existingGroups, onProgress),
      (s) => s.categorizeTabs(tabs, existingGroups, onProgress),
    );
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    return this.executeWithFallback(
      (s) => s.findSimilarTabs(referenceTab, candidateTabs),
      (s) => s.findSimilarTabs(referenceTab, candidateTabs),
    );
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    return this.executeWithFallback(
      (s) => s.generateWindowName(tabs, groups),
      (s) => s.generateWindowName(tabs, groups),
    );
  }
}

export const llmManager = new LLMManager();
