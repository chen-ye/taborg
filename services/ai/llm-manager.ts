import type {
  LLMModelConfig,
  LLMProvider,
  LLMService,
  LLMStrategyType,
  ProviderSetting,
  TabData,
} from '../../types/llm-types';
import { StorageKeys } from '../../utils/storage-keys.js';
import { CHROME_AI_PROVIDER_ID, CHROME_AI_SERVICE, PROVIDER_CONFIG } from './provider-config';
import { BatchedLLMStrategy, StandardLLMStrategy } from './strategies';

const DEFAULT_PROVIDER_ORDER: LLMProvider[] = ['gemini', 'openai', 'openai-custom', 'chrome-ai'];

export class LLMManager implements LLMService {
  private providerOrder: ProviderSetting[] = [];
  private modelConfig: LLMModelConfig = {};
  private settingsPromise: Promise<void>;

  // Cache for the active service instance
  private serviceCache = new Map<string, LLMService>();

  constructor() {
    this.settingsPromise = this.loadSettings();
    chrome.storage.onChanged.addListener(this.handleStorageChange);
  }

  private async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        StorageKeys.Sync.PROVIDER_ORDER,
        // Legacy fallback
        StorageKeys.Sync.ACTIVE_LLM_PROVIDER,
        StorageKeys.Sync.LLM_STRATEGY_OVERRIDE,
        StorageKeys.Sync.GEMINI_API_KEY,
        StorageKeys.Sync.GEMINI_MODEL_ID,
        StorageKeys.Sync.OPENAI_BASE_URL,
        StorageKeys.Sync.OPENAI_API_KEY,
        StorageKeys.Sync.OPENAI_MODEL_ID,
        StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL,
        StorageKeys.Sync.OPENAI_CUSTOM_API_KEY,
        StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID,
      ]);

      // Migration Logic
      if (result[StorageKeys.Sync.PROVIDER_ORDER]) {
        this.providerOrder = result[StorageKeys.Sync.PROVIDER_ORDER] as ProviderSetting[];
      } else {
        // Initialize from legacy settings
        const active: LLMProvider = (result[StorageKeys.Sync.ACTIVE_LLM_PROVIDER] as LLMProvider) || 'gemini';
        this.providerOrder = DEFAULT_PROVIDER_ORDER.map((id) => ({
          id,
          enabled: id === active,
        }));

        // Ensure active is first if it exists in defaults, otherwise just respect the default order with active enabled
        const activeIndex = this.providerOrder.findIndex((p) => p.id === active);
        if (activeIndex > -1) {
          const [activeItem] = this.providerOrder.splice(activeIndex, 1);
          this.providerOrder.unshift(activeItem);
        }

        // Persist the migration
        await chrome.storage.sync.set({ [StorageKeys.Sync.PROVIDER_ORDER]: this.providerOrder });
      }

      // Update model config with nullish assignment
      this.modelConfig.strategyOverride ??= result[StorageKeys.Sync.LLM_STRATEGY_OVERRIDE] as
        | LLMStrategyType
        | undefined;
      this.modelConfig.geminiApiKey ??= result[StorageKeys.Sync.GEMINI_API_KEY] as string | undefined;
      this.modelConfig.geminiModelId ??= result[StorageKeys.Sync.GEMINI_MODEL_ID] as string | undefined;
      this.modelConfig.openaiBaseUrl ??= result[StorageKeys.Sync.OPENAI_BASE_URL] as string | undefined;
      this.modelConfig.openaiApiKey ??= result[StorageKeys.Sync.OPENAI_API_KEY] as string | undefined;
      this.modelConfig.openaiModelId ??= result[StorageKeys.Sync.OPENAI_MODEL_ID] as string | undefined;
      this.modelConfig.openaiCustomBaseUrl ??= result[StorageKeys.Sync.OPENAI_CUSTOM_BASE_URL] as string | undefined;
      this.modelConfig.openaiCustomApiKey ??= result[StorageKeys.Sync.OPENAI_CUSTOM_API_KEY] as string | undefined;
      this.modelConfig.openaiCustomModelId ??= result[StorageKeys.Sync.OPENAI_CUSTOM_MODEL_ID] as string | undefined;
    } catch (e) {
      console.error('Failed to load settings:', e);
      throw e;
    }
  }

  private handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'sync') {
      let configChanged = false;

      if (changes[StorageKeys.Sync.PROVIDER_ORDER]) {
        this.providerOrder = changes[StorageKeys.Sync.PROVIDER_ORDER].newValue as ProviderSetting[];
        // We don't necessarily need to invalidate cache here, as provider configurations haven't changed, just their order/enabled state.
      }

      if (changes[StorageKeys.Sync.LLM_STRATEGY_OVERRIDE]) {
        this.modelConfig.strategyOverride = changes[StorageKeys.Sync.LLM_STRATEGY_OVERRIDE].newValue as
          | LLMStrategyType
          | undefined;
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
        this.serviceCache.clear(); // Invalidate all cached services
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

    // Check cache
    if (this.serviceCache.has(provider)) {
      // In a real implementation we'd check hash per provider, simplifed here
      return this.serviceCache.get(provider)!;
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
      this.serviceCache.set(provider, service);

      return service;
    } catch (e) {
      console.error(`Failed to initialize ${provider} service:`, e);
      return CHROME_AI_SERVICE;
    }
  }

  async isAvailable(): Promise<boolean> {
    await this.settingsPromise;

    // Check if any enabled provider is available
    for (const setting of this.providerOrder) {
      if (setting.enabled) {
        try {
          const service = await this.getService(setting.id);
          if (await service.isAvailable()) return true;
        } catch (e) {
          console.warn(`Provider ${setting.id} check failed:`, e);
        }
      }
    }
    return false;
  }

  private async executeWithFallback<T>(operation: (service: LLMService) => Promise<T>): Promise<T> {
    await this.settingsPromise;

    const enabledProviders = this.providerOrder.filter((p) => p.enabled);
    if (enabledProviders.length === 0) {
      throw new Error('No AI providers are enabled.');
    }

    let lastError: unknown;

    for (const setting of enabledProviders) {
      try {
        const service = await this.getService(setting.id);
        // Optimization: check availability before trying operation for local models?
        // For now, we assume getService returns a usable client or throws.

        return await operation(service);
      } catch (error) {
        console.warn(`Provider ${setting.id} failed:`, error);
        lastError = error;
        // Continue to next provider
      }
    }

    throw lastError || new Error('All enabled AI providers failed.');
  }

  async categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>> {
    return this.executeWithFallback((s) => s.categorizeTabs(tabs, existingGroups, onProgress));
  }

  async findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]> {
    return this.executeWithFallback((s) => s.findSimilarTabs(referenceTab, candidateTabs));
  }

  async generateWindowName(tabs: TabData[], groups: string[]): Promise<string> {
    return this.executeWithFallback((s) => s.generateWindowName(tabs, groups));
  }
}

export const llmManager = new LLMManager();
