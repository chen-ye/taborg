import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIService } from './openai';

// Mock openai
const createCompletionMock = vi.fn();

vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: createCompletionMock,
        },
      };
    },
  };
});

describe('OpenAIService', () => {
  let service: OpenAIService;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({
            openaiApiKey: 'test-key',
            openaiBaseUrl: 'http://test.url',
            openaiModel: 'test-model',
          } as any),
          set: vi.fn().mockResolvedValue(undefined as any),
        },
      },
    };
    service = new OpenAIService();
  });

  it('should load settings from storage', async () => {
    await service.loadSettings();
    expect(chrome.storage.sync.get).toHaveBeenCalledWith(['openaiApiKey', 'openaiBaseUrl', 'openaiModel']);
  });

  it('should check availability based on API key', async () => {
    (service as any).apiKey = null;
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ openaiApiKey: '' } as any);
    const available = await service.isAvailable();
    expect(available).toBe(false);

    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ openaiApiKey: 'key' } as any);
    const available2 = await service.isAvailable();
    expect(available2).toBe(true);
  });

  it('should categorize tabs using OpenAI', async () => {
    (service as any).apiKey = 'test-key';
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: [{ tabId: 1, groupNames: ['AI'] }],
            }),
          },
        },
      ],
    });

    const results = await service.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(results.get(1)).toEqual(['AI']);
    expect(createCompletionMock).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    (service as any).apiKey = 'test-key';
    createCompletionMock.mockRejectedValue(new Error('API Error'));
    await expect(service.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], [])).rejects.toThrow('API Error');
  });
});
