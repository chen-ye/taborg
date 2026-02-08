import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
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
  if (!config.openaiApiKey) {
    throw new Error('OpenAI API Key is required');
  }
  const openai = createOpenAI({
    apiKey: config.openaiApiKey,
  });
  return openai(config.openaiModelId || 'gpt-4o');
}

export function getCustomOpenAIModel(config: LLMModelConfig) {
  if (!config.openaiCustomBaseUrl) {
    throw new Error('Custom OpenAI Base URL is required');
  }
  const openaiCompatible = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL: config.openaiCustomBaseUrl,
    apiKey: config.openaiCustomApiKey || 'not-needed',
  });
  return openaiCompatible(config.openaiCustomModelId || 'gpt-4o');
}
