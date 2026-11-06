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
    supportsStructuredOutputs: true,
  });
  return openaiCompatible(config.openaiCustomModelId || 'gpt-4o');
}

export async function listGoogleModels(config: LLMModelConfig): Promise<string[]> {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API Key is required');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  // Filter for models that support 'generateContent' and clean up names
  return (data.models as Array<{ name: string; supportedGenerationMethods: string[] }>)
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace('models/', ''));
}

export async function listOpenAIModels(config: LLMModelConfig): Promise<string[]> {
  if (!config.openaiApiKey) {
    throw new Error('OpenAI API Key is required');
  }

  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.data as Array<{ id: string }>).map((m) => m.id);
}

export async function listCustomModels(config: LLMModelConfig): Promise<string[]> {
  if (!config.openaiCustomBaseUrl) {
    throw new Error('Custom OpenAI Base URL is required');
  }

  // Ensure base URL doesn't end with a slash for cleaner concatenation
  const baseUrl = config.openaiCustomBaseUrl.replace(/\/$/, '');

  const headers: Record<string, string> = {};
  if (config.openaiCustomApiKey) {
    headers.Authorization = `Bearer ${config.openaiCustomApiKey}`;
  }

  const response = await fetch(`${baseUrl}/models`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.data as Array<{ id: string }>).map((m) => m.id);
}
