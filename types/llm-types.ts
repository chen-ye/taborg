export interface TabData {
  id: number;
  title: string;
  url: string;
}

export type LLMProvider = 'gemini' | 'chrome-ai' | 'openai' | 'openai-custom';
export type LLMStrategyType = 'default' | 'standard' | 'batched';

export interface LLMService {
  isAvailable(): Promise<boolean>;
  categorizeTabs(
    tabs: TabData[],
    existingGroups: string[],
    onProgress?: (results: Map<number, string[]>) => void,
  ): Promise<Map<number, string[]>>;
  findSimilarTabs(referenceTab: TabData, candidateTabs: TabData[]): Promise<number[]>;
  generateWindowName(tabs: TabData[], groups: string[]): Promise<string>;
}

export interface LLMModelConfig {
  geminiApiKey?: string;
  geminiModelId?: string;
  openaiModelId?: string;
  /** @deprecated Use openaiCustomBaseUrl for openai-custom provider instead */
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiCustomBaseUrl?: string;
  openaiCustomApiKey?: string;
  openaiCustomModelId?: string;
  strategyOverride?: LLMStrategyType;
}

export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  required?: string[];
  description?: string;
};

export type AutoCategorizationMode = 'off' | 'initial' | 'always';
