import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMManager } from './llm-manager';
import { getGoogleModel, getOpenAIModel, getCustomOpenAIModel } from './providers';
import { BatchedLLMStrategy, StandardLLMStrategy } from './strategies';

// Mock objects with vi.hoisted
const { mockChromeAIService } = vi.hoisted(() => ({
  mockChromeAIService: {
    isAvailable: vi.fn(),
    categorizeTabs: vi.fn(),
    findSimilarTabs: vi.fn(),
    generateWindowName: vi.fn(),
  },
}));

vi.mock('./providers', () => ({
  getGoogleModel: vi.fn(),
  getOpenAIModel: vi.fn(),
  getCustomOpenAIModel: vi.fn(),
}));

vi.mock('./strategies', () => ({
  StandardLLMStrategy: vi.fn(),
  BatchedLLMStrategy: vi.fn(),
}));

vi.mock('./provider-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./provider-config')>();
  return {
    ...actual,
    CHROME_AI_SERVICE: mockChromeAIService,
  };
});

describe('LLMManager', () => {
  let manager: LLMManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ 
            'active-llm-provider': 'gemini', 
            'llm-fallback-enabled': true,
            'geminiApiKey': 'test-key'
          } as any),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    };

    // Setup default strategy mock implementation
    const mockStrategyInstance = {
      isAvailable: vi.fn().mockResolvedValue(true),
      categorizeTabs: vi.fn(),
      findSimilarTabs: vi.fn(),
      generateWindowName: vi.fn(),
    };
    
    vi.mocked(StandardLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });
    vi.mocked(BatchedLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });
    
    vi.mocked(getGoogleModel).mockReturnValue({} as any);
    vi.mocked(getOpenAIModel).mockReturnValue({} as any);
    vi.mocked(getCustomOpenAIModel).mockReturnValue({} as any);

    manager = new LLMManager();
  });

  it('should use active provider (gemini)', async () => {
    const mockStrategyInstance = {
      isAvailable: vi.fn().mockResolvedValue(true),
      categorizeTabs: vi.fn().mockResolvedValue(new Map([[1, ['G']]])),
    };
    vi.mocked(StandardLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(getGoogleModel).toHaveBeenCalled();
    expect(StandardLLMStrategy).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['G']);
  });

  it('should use openai-custom provider', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ 
      'active-llm-provider': 'openai-custom', 
      'openaiCustomBaseUrl': 'http://custom:11434/v1'
    } as any);

    const mockStrategyInstance = {
      isAvailable: vi.fn().mockResolvedValue(true),
      categorizeTabs: vi.fn().mockResolvedValue(new Map([[1, ['C']]])),
    };
    vi.mocked(StandardLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });

    manager = new LLMManager();
    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    
    expect(getCustomOpenAIModel).toHaveBeenCalledWith(expect.objectContaining({
      openaiCustomBaseUrl: 'http://custom:11434/v1'
    }));
    expect(results.get(1)).toEqual(['C']);
  });

  it('should apply strategy override', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ 
      'active-llm-provider': 'gemini', 
      'geminiApiKey': 'test-key',
      'llm-strategy-override': 'batched'
    } as any);
    
    const mockStrategyInstance = {
      isAvailable: vi.fn().mockResolvedValue(true),
      categorizeTabs: vi.fn().mockResolvedValue(new Map([[1, ['B']]])),
    };
    vi.mocked(BatchedLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });

    manager = new LLMManager();
    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    
    expect(BatchedLLMStrategy).toHaveBeenCalled();
    expect(StandardLLMStrategy).not.toHaveBeenCalled();
    expect(results.get(1)).toEqual(['B']);
  });

  it('should fallback to chrome-ai if primary provider fails', async () => {
    const mockStrategyInstance = {
      isAvailable: vi.fn().mockResolvedValue(true),
      categorizeTabs: vi.fn().mockRejectedValue(new Error('Primary failed')),
    };
    vi.mocked(StandardLLMStrategy).mockImplementation(function() { return mockStrategyInstance as any; });
    
    vi.mocked(mockChromeAIService.isAvailable).mockResolvedValue(true);
    vi.mocked(mockChromeAIService.categorizeTabs).mockResolvedValue(new Map([[1, ['FB']]]));

    const results = await manager.categorizeTabs([{ id: 1, title: 'T', url: 'u' }], []);
    expect(mockChromeAIService.categorizeTabs).toHaveBeenCalled();
    expect(results.get(1)).toEqual(['FB']);
  });
});