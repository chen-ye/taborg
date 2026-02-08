import type { LLMModelConfig, LLMProvider, LLMService, LLMStrategyType, TabData } from '../../types/llm-types';
import { CHROME_AI_PROVIDER_ID, CHROME_AI_SERVICE, PROVIDER_CONFIG } from './provider-config';
import { BatchedLLMStrategy, StandardLLMStrategy } from './strategies';

export class LLMManager implements LLMService {
  private activeProvider: LLMProvider | undefined;
  private fallbackEnabled: boolean | undefined;
  private modelConfig: LLMModelConfig = {};
  private settingsPromise: Promise<void>;

  // Cache for the active service instance
  private activeService: LLMService | null = null;
  private lastConfigHash: string = '';

  constructor() {
    this.settingsPromise = this.loadSettings();
    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private async loadSettings() {
    const result = await chrome.storage.sync.get([
      'active-llm-provider',
      'llm-fallback-enabled',
      'llm-strategy-override',
      'geminiApiKey',
      'geminiModelId',
      'openaiBaseUrl',
      'openaiApiKey',
      'openaiModelId',
      'openaiCustomBaseUrl',
      'openaiCustomApiKey',
      'openaiCustomModelId',
    ]);

    // Only set if not already updated by handleStorageChange (race condition fix)
    this.activeProvider ??= (result['active-llm-provider'] as LLMProvider) || 'gemini';
    this.fallbackEnabled ??= result['llm-fallback-enabled'] === true;

    // Update model config with nullish assignment
    this.modelConfig.strategyOverride ??= result['llm-strategy-override'] as LLMStrategyType | undefined;
    this.modelConfig.geminiApiKey ??= result.geminiApiKey as string | undefined;
    this.modelConfig.geminiModelId ??= result.geminiModelId as string | undefined;
    this.modelConfig.openaiBaseUrl ??= result.openaiBaseUrl as string | undefined;
    this.modelConfig.openaiApiKey ??= result.openaiApiKey as string | undefined;
    this.modelConfig.openaiModelId ??= result.openaiModelId as string | undefined;
    this.modelConfig.openaiCustomBaseUrl ??= result.openaiCustomBaseUrl as string | undefined;
    this.modelConfig.openaiCustomApiKey ??= result.openaiCustomApiKey as string | undefined;
    this.modelConfig.openaiCustomModelId ??= result.openaiCustomModelId as string | undefined;
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'sync') {
      let configChanged = false;

      if (changes['active-llm-provider']) {
        this.activeProvider = changes['active-llm-provider'].newValue as LLMProvider;
        configChanged = true;
      }
      if (changes['llm-fallback-enabled']) {
        this.fallbackEnabled = changes['llm-fallback-enabled'].newValue as boolean;
      }
      if (changes['llm-strategy-override']) {
        this.modelConfig.strategyOverride = changes['llm-strategy-override'].newValue as LLMStrategyType | undefined;
        configChanged = true;
      }

      const configKeys: (keyof LLMModelConfig)[] = [
        'geminiApiKey',
        'geminiModelId',
        'openaiBaseUrl',
        'openaiApiKey',
        'openaiModelId',
        'openaiCustomBaseUrl',
        'openaiCustomApiKey',
        'openaiCustomModelId',
      ];

      for (const key of configKeys) {
        if (changes[key]) {
          this.modelConfig[key] = changes[key].newValue as any;
          configChanged = true;
        }
      }

      if (configChanged) {
        this.activeService = null; // Invalidate cache
      }
    }
  };

  private createConfigHash(provider: LLMProvider): string {
    return JSON.stringify({
      provider,
      ...this.modelConfig,
    });
  }

  private async getService(provider: LLMProvider): Promise<LLMService> {
    await this.settingsPromise;

    // Return cached service if valid
    const currentHash = this.createConfigHash(provider);
    if (this.activeService && this.lastConfigHash === currentHash) {
      return this.activeService;
    }

    if (provider === CHROME_AI_PROVIDER_ID) {
      return CHROME_AI_SERVICE;
    }

    const definition = PROVIDER_CONFIG[provider];
    if (!definition) {
      console.error(`Unknown provider: ${provider}, falling back to Chrome AI`);
      return CHROME_AI_SERVICE;
    }

    try {
      const model = definition.getModel(this.modelConfig);
      let StrategyClass = definition.defaultStrategy;

      // Apply override if set
      if (this.modelConfig.strategyOverride === 'standard') {
        StrategyClass = StandardLLMStrategy;
      } else if (this.modelConfig.strategyOverride === 'batched') {
        StrategyClass = BatchedLLMStrategy;
      }

      const service = new StrategyClass(model);

      // Update cache
      this.activeService = service;
      this.lastConfigHash = currentHash;

      return service;
    } catch (e) {
      console.error(`Failed to initialize ${provider} service:`, e);
      return CHROME_AI_SERVICE;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.settingsPromise;
      const service = await this.getService(this.activeProvider!);
      const activeAvailable = await service.isAvailable();
      if (activeAvailable) return true;
    } catch (e) {
      console.warn(`Active provider ${this.activeProvider} not available:`, e);
    }

    if (this.fallbackEnabled && this.activeProvider !== CHROME_AI_PROVIDER_ID) {
      return CHROME_AI_SERVICE.isAvailable();
    }
    return false;
  }

  private async executeWithFallback<T>(
    operation: (service: LLMService) => Promise<T>,
    fallbackOperation: (service: LLMService) => Promise<T>,
  ): Promise<T> {
    try {
      await this.settingsPromise;
      const service = await this.getService(this.activeProvider!);
      return await operation(service);
    } catch (error) {
      if (this.fallbackEnabled && this.activeProvider !== CHROME_AI_PROVIDER_ID) {
        console.warn('Primary LLM failed, attempting fallback to Chrome AI', error);
        if (await CHROME_AI_SERVICE.isAvailable()) {
          return await fallbackOperation(CHROME_AI_SERVICE);
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
