import type { LanguageModel } from 'ai';
import type { LLMModelConfig, LLMProvider, LLMService } from '../../types/llm-types';
import { chromeAIService } from './chrome-ai-service';
import { getGoogleModel, getOpenAIModel } from './providers';
import { StandardLLMStrategy } from './strategies';

interface ProviderDefinition {
  getModel: (config: LLMModelConfig) => LanguageModel;
  defaultStrategy: new (model: LanguageModel) => LLMService;
}

export const PROVIDER_CONFIG: Partial<Record<LLMProvider, ProviderDefinition>> = {
  gemini: {
    getModel: getGoogleModel,
    defaultStrategy: StandardLLMStrategy,
  },
  openai: {
    getModel: getOpenAIModel,
    defaultStrategy: StandardLLMStrategy,
  },
};

export const CHROME_AI_PROVIDER_ID: LLMProvider = 'chrome-ai';
export const CHROME_AI_SERVICE = chromeAIService;
