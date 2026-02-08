import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandardLLMStrategy, BatchedLLMStrategy } from './strategies';
import { generateText, Output } from 'ai';
import { TabData } from '../../types/llm-types';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn(),
  },
}));

// Mock chrome storage
const mockStorage = {
  sync: {
    get: vi.fn().mockResolvedValue({}),
  },
};
(global as any).chrome = {
  storage: mockStorage,
};

describe('LLM Strategies', () => {
  const mockModel = {} as any;
  const mockTabs: TabData[] = [
    { id: 1, title: 'Google', url: 'https://google.com' },
    { id: 2, title: 'Bing', url: 'https://bing.com' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StandardLLMStrategy', () => {
    it('should categorize tabs in a single request', async () => {
      (generateText as any).mockResolvedValue({
        output: {
          suggestions: [
            { tabId: 1, groupNames: ['Search'] },
            { tabId: 2, groupNames: ['Search'] },
          ],
        },
      });

      const strategy = new StandardLLMStrategy(mockModel);
      const results = await strategy.categorizeTabs(mockTabs, []);

      expect(generateText).toHaveBeenCalledTimes(1);
      expect(results.get(1)).toEqual(['Search']);
      expect(results.get(2)).toEqual(['Search']);
    });
  });

  describe('BatchedLLMStrategy', () => {
    it('should categorize tabs in batches', async () => {
      (generateText as any).mockResolvedValue({
        output: {
          suggestions: [{ tabId: 1, groupNames: ['Batch1'] }],
        },
      }).mockResolvedValueOnce({
        output: {
          suggestions: [{ tabId: 1, groupNames: ['Batch1'] }],
        },
      }).mockResolvedValueOnce({
        output: {
          suggestions: [{ tabId: 2, groupNames: ['Batch2'] }],
        },
      });

      const strategy = new BatchedLLMStrategy(mockModel, 1); // Batch size 1
      const results = await strategy.categorizeTabs(mockTabs, []);

      expect(generateText).toHaveBeenCalledTimes(2);
      expect(results.get(1)).toEqual(['Batch1']);
      expect(results.get(2)).toEqual(['Batch2']);
    });
  });
});
