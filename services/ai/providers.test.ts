import { describe, it, expect } from 'vitest';
import { getGoogleModel, getOpenAIModel, getCustomOpenAIModel } from './providers';
import type { LLMModelConfig } from '../../types/llm-types';

describe('Providers', () => {
  describe('getGoogleModel', () => {
    it('should throw if no API key is provided', () => {
      expect(() => getGoogleModel({})).toThrow('Gemini API Key is required');
    });

    it('should return a model instance', () => {
      const config: LLMModelConfig = { geminiApiKey: 'test-key' };
      const model = getGoogleModel(config);
      expect(model).toBeDefined();
      expect(model.provider).toBe('google.generative-ai');
    });
  });

  describe('getOpenAIModel', () => {
    it('should throw if no API key is provided', () => {
      expect(() => getOpenAIModel({})).toThrow('OpenAI API Key is required');
    });

    it('should return a model instance', () => {
      const config: LLMModelConfig = { openaiApiKey: 'test-key' };
      const model = getOpenAIModel(config);
      expect(model).toBeDefined();
      expect(model.provider).toBe('openai.responses');
    });
  });

  describe('getCustomOpenAIModel', () => {
    it('should throw if no Base URL is provided', () => {
      expect(() => getCustomOpenAIModel({})).toThrow('Custom OpenAI Base URL is required');
    });

    it('should return a model instance with correct configuration', () => {
      const config: LLMModelConfig = { 
        openaiCustomBaseUrl: 'http://localhost:11434/v1',
        openaiCustomApiKey: 'custom-key'
      };
      const model = getCustomOpenAIModel(config);
      expect(model).toBeDefined();
      expect(model.provider).toBe('openai-compatible.chat');
    });
  });
});