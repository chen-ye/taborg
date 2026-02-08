import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listGoogleModels, listOpenAIModels, listCustomModels } from './providers';

describe('Provider Model Listing', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listGoogleModels', () => {
    it('should throw if no API key is provided', async () => {
      await expect(listGoogleModels({})).rejects.toThrow('Gemini API Key is required');
    });

    it('should fetch and return model IDs', async () => {
      const mockResponse = {
        models: [
          { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', supportedGenerationMethods: ['generateContent'] },
        ],
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const models = await listGoogleModels({ geminiApiKey: 'test-key' });
      expect(models).toEqual(['gemini-pro', 'gemini-1.5-flash']);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models')
      );
    });
  });

  describe('listOpenAIModels', () => {
    it('should throw if no API key is provided', async () => {
      await expect(listOpenAIModels({})).rejects.toThrow('OpenAI API Key is required');
    });

    it('should fetch and return model IDs', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4o', object: 'model' },
          { id: 'gpt-3.5-turbo', object: 'model' },
        ],
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const models = await listOpenAIModels({ openaiApiKey: 'test-key' });
      expect(models).toEqual(['gpt-4o', 'gpt-3.5-turbo']);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        })
      );
    });
  });

  describe('listCustomModels', () => {
    it('should throw if no Base URL is provided', async () => {
      await expect(listCustomModels({})).rejects.toThrow('Custom OpenAI Base URL is required');
    });

    it('should fetch and return model IDs from custom endpoint', async () => {
      const mockResponse = {
        data: [
          { id: 'llama3', object: 'model' },
        ],
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const models = await listCustomModels({ 
        openaiCustomBaseUrl: 'http://localhost:11434/v1',
        openaiCustomApiKey: 'custom-key'
      });
      expect(models).toEqual(['llama3']);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.anything()
      );
    });
  });
});
