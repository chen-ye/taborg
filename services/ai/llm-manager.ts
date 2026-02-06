import type { LLMModelConfig, LLMProvider, LLMService, TabData } from '../../types/llm-types';
import { chromeAIService } from './chrome-ai-service';
import { getGoogleModel, getOpenAIModel } from './providers';
import { StandardLLMStrategy } from './strategies';

export class LLMManager implements LLMService {
  private activeProvider: LLMProvider = 'gemini';
  private fallbackEnabled = false;
  private modelConfig: LLMModelConfig = {};
  private settingsPromise: Promise<void>;

  constructor() {
    this.settingsPromise = this.loadSettings();
    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private async loadSettings() {
    const result = await chrome.storage.sync.get([
      'active-llm-provider',
      'llm-fallback-enabled',
      'geminiApiKey',
      'geminiModelId',
      'openaiBaseUrl',
      'openaiApiKey',
      'openaiModelId',
    ]);
    this.activeProvider = (result['active-llm-provider'] as LLMProvider) || 'gemini';
    this.fallbackEnabled = result['llm-fallback-enabled'] === true;
    this.modelConfig = {
      geminiApiKey: result.geminiApiKey as string | undefined,
      geminiModelId: result.geminiModelId as string | undefined,
      openaiBaseUrl: result.openaiBaseUrl as string | undefined,
      openaiApiKey: result.openaiApiKey as string | undefined,
      openaiModelId: result.openaiModelId as string | undefined,
    };
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'sync') {
      if (changes['active-llm-provider']) {
        this.activeProvider = changes['active-llm-provider'].newValue as LLMProvider;
      }
      if (changes['llm-fallback-enabled']) {
        this.fallbackEnabled = changes['llm-fallback-enabled'].newValue as boolean;
      }
      if (changes.geminiApiKey) this.modelConfig.geminiApiKey = changes.geminiApiKey.newValue as string | undefined;
      if (changes.geminiModelId) this.modelConfig.geminiModelId = changes.geminiModelId.newValue as string | undefined;
      if (changes.openaiBaseUrl) this.modelConfig.openaiBaseUrl = changes.openaiBaseUrl.newValue as string | undefined;
      if (changes.openaiApiKey) this.modelConfig.openaiApiKey = changes.openaiApiKey.newValue as string | undefined;
      if (changes.openaiModelId) this.modelConfig.openaiModelId = changes.openaiModelId.newValue as string | undefined;
    }
  };

  private async getService(provider: LLMProvider): Promise<LLMService> {
    await this.settingsPromise;
    if (provider === 'chrome-ai') {
      return chromeAIService;
    }

    try {
      if (provider === 'gemini') {
        const model = getGoogleModel(this.modelConfig);
        return new StandardLLMStrategy(model);
      }

      if (provider === 'openai') {
        const model = getOpenAIModel(this.modelConfig);
        return new StandardLLMStrategy(model);
      }
    } catch (e) {
      console.error(`Failed to initialize ${provider} service:`, e);
    }

    return chromeAIService;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.settingsPromise;
      const service = await this.getService(this.activeProvider);
      const activeAvailable = await service.isAvailable();
      if (activeAvailable) return true;
    } catch (e) {
      console.warn(`Active provider ${this.activeProvider} not available:`, e);
    }

    if (this.fallbackEnabled && this.activeProvider !== 'chrome-ai') {
      const fallbackService = await this.getService('chrome-ai');
      return fallbackService.isAvailable();
    }
    return false;
  }

  private async executeWithFallback<T>(
    operation: (service: LLMService) => Promise<T>,
    fallbackOperation: (service: LLMService) => Promise<T>,
  ): Promise<T> {
    try {
      await this.settingsPromise;
      const service = await this.getService(this.activeProvider);
      // We don't check isAvailable here again to avoid redundant calls, 
      // the operation itself should fail if not available.
      return await operation(service);
    } catch (error) {
      if (this.fallbackEnabled && this.activeProvider !== 'chrome-ai') {
        console.warn('Primary LLM failed, attempting fallback to Chrome AI', error);
        const fallbackService = await this.getService('chrome-ai');
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