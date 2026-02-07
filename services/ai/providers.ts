import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LLMModelConfig } from '../../types/llm-types';

export function getGoogleModel(config: LLMModelConfig) {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API Key is required');
  }
  const google = createGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
  });
  return google(config.geminiModelId || 'gemini-1.5-flash');
}

export function getOpenAIModel(config: LLMModelConfig) {
  if (!config.openaiApiKey && !config.openaiBaseUrl) {
    throw new Error('OpenAI API Key is required');
  }
  const openai = createOpenAI({
    apiKey: config.openaiApiKey || 'not-needed',
    baseURL: config.openaiBaseUrl,
  });
  return openai(config.openaiModelId || 'gpt-4o');
}
