import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiService } from './gemini';

// Mock @google/genai
const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    }
  }
}));

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ geminiApiKey: 'test-key' }),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    service = new GeminiService();
  });

  it('should load API key from storage', async () => {
    await service.loadApiKey();
    expect(chrome.storage.sync.get).toHaveBeenCalledWith('geminiApiKey');
  });

  it('should check availability based on API key', async () => {
    (service as any).apiKey = null;
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ geminiApiKey: '' });
    const available = await service.isAvailable();
    expect(available).toBe(false);

    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ geminiApiKey: 'key' });
    const available2 = await service.isAvailable();
    expect(available2).toBe(true);
  });

  it('should categorize tabs using GoogleGenAI', async () => {
    (service as any).apiKey = 'test-key';
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        suggestions: [{ tabId: 1, groupNames: ['AI'] }],
      }),
    });

    const results = await service.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(results.get(1)).toEqual(['AI']);
    expect(generateContentMock).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    (service as any).apiKey = 'test-key';
    generateContentMock.mockRejectedValue(new Error('API Error'));
    await expect(service.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], [])).rejects.toThrow('API Error');
  });
});
