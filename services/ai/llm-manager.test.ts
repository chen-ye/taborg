import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMManager } from './llm-manager';
import { geminiService } from './gemini';
import { chromeAIService } from './chrome-ai-service';

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

describe('LLMManager', () => {
  let manager: LLMManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ 'active-llm-provider': 'gemini', 'llm-fallback-enabled': true } as any),
        },
        onChanged: {
          addListener: vi.fn(),
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

  it('should fallback to chrome-ai if gemini fails and fallback is enabled', async () => {
    vi.mocked(geminiService.isAvailable).mockResolvedValue(true);
    vi.mocked(geminiService.categorizeTabs).mockRejectedValue(new Error('Gemini failed'));
    vi.mocked(chromeAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(chromeAIService.categorizeTabs).mockResolvedValue(new Map([[1, ['FB']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(chromeAIService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['FB']);
  });

  it('should not fallback if fallback is disabled', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ 'active-llm-provider': 'gemini', 'llm-fallback-enabled': false } as any);
    manager = new LLMManager(); // Re-init to pick up settings

    vi.mocked(geminiService.isAvailable).mockResolvedValue(true);
    vi.mocked(geminiService.categorizeTabs).mockRejectedValue(new Error('Gemini failed'));

    await expect(manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], [])).rejects.toThrow('Gemini failed');
    expect(chromeAIService.categorizeTabs).not.toHaveBeenCalled();
  });
});