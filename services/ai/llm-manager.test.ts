import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeAIService } from './chrome-ai-service';
import { geminiService } from './gemini';
import { LLMManager } from './llm-manager';
import { openAIService } from './openai';

vi.mock('./gemini', () => ({
  geminiService: {
    isAvailable: vi.fn(),
    categorizeTabs: vi.fn(),
    findSimilarTabs: vi.fn(),
    generateWindowName: vi.fn(),
  },
}));

vi.mock('./chrome-ai-service', () => ({
  chromeAIService: {
    isAvailable: vi.fn(),
    categorizeTabs: vi.fn(),
    findSimilarTabs: vi.fn(),
    generateWindowName: vi.fn(),
  },
}));

vi.mock('./openai', () => ({
  openAIService: {
    isAvailable: vi.fn(),
    categorizeTabs: vi.fn(),
    findSimilarTabs: vi.fn(),
    generateWindowName: vi.fn(),
  },
}));

describe('LLMManager', () => {
  let manager: LLMManager;
  let storageChangeListener: (changes: Record<string, any>, areaName: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ 'active-llm-provider': 'gemini', 'llm-fallback-enabled': true } as any),
        },
        onChanged: {
          addListener: vi.fn((listener) => {
            storageChangeListener = listener;
          }),
        },
      },
    };
    manager = new LLMManager();
  });

  it('should use active provider (gemini)', async () => {
    vi.mocked(geminiService.isAvailable).mockResolvedValue(true);
    vi.mocked(geminiService.categorizeTabs).mockResolvedValue(new Map([[1, ['G']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(geminiService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['G']);
  });

  it('should use active provider (openai)', async () => {
    // Update active provider via storage change listener
    storageChangeListener({ 'active-llm-provider': { newValue: 'openai' } }, 'sync');

    vi.mocked(openAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(openAIService.categorizeTabs).mockResolvedValue(new Map([[1, ['O']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(openAIService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['O']);
  });

  it('should fallback to chrome-ai if gemini fails and fallback is enabled', async () => {
    vi.mocked(geminiService.isAvailable).mockResolvedValue(true);
    vi.mocked(geminiService.categorizeTabs).mockRejectedValue(new Error('Gemini failed'));
    vi.mocked(chromeAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(chromeAIService.categorizeTabs).mockResolvedValue(new Map([[1, ['FB']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(chromeAIService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['FB']);
  });

  it('should fallback to chrome-ai if openai fails and fallback is enabled', async () => {
    storageChangeListener({ 'active-llm-provider': { newValue: 'openai' } }, 'sync');

    vi.mocked(openAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(openAIService.categorizeTabs).mockRejectedValue(new Error('OpenAI failed'));
    vi.mocked(chromeAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(chromeAIService.categorizeTabs).mockResolvedValue(new Map([[1, ['FB']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(chromeAIService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['FB']);
  });

  it('should not fallback if fallback is disabled', async () => {
    storageChangeListener(
      {
        'active-llm-provider': { newValue: 'gemini' },
        'llm-fallback-enabled': { newValue: false },
      },
      'sync',
    );

    vi.mocked(geminiService.isAvailable).mockResolvedValue(true);
    vi.mocked(geminiService.categorizeTabs).mockRejectedValue(new Error('Gemini failed'));

    await expect(manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], [])).rejects.toThrow('Gemini failed');
    expect(chromeAIService.categorizeTabs).not.toHaveBeenCalled();
  });
});
