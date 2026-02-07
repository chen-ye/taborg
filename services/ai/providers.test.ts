import { describe, it, expect, vi } from 'vitest';
import { getGoogleModel, getOpenAIModel } from './providers';

// Mock the AI SDK providers
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ modelId: 'google-model' }))),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: 'openai-model' }))),
}));

describe('Provider Factories', () => {
  describe('getGoogleModel', () => {
    it('should throw if no API key is provided', () => {
      expect(() => getGoogleModel({})).toThrow('Gemini API Key is required');
    });

    it('should return a model if API key is provided', () => {
      const model = getGoogleModel({ geminiApiKey: 'test-key' });
      expect(model).toBeDefined();
    });
  });

  describe('getOpenAIModel', () => {
    it('should throw if no API key and no localhost URL', () => {
      expect(() => getOpenAIModel({})).toThrow('OpenAI API Key is required');
    });

    it('should return a model if API key is provided', () => {
      const model = getOpenAIModel({ openaiApiKey: 'test-key' });
      expect(model).toBeDefined();
    });

    it('should return a model without API key if base URL is provided', () => {
      const model = getOpenAIModel({ openaiBaseUrl: 'http://192.168.1.50:11434/v1' });
      expect(model).toBeDefined();
    });
  });
});
