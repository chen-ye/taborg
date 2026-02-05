import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeAIService } from './chrome-ai-service';
import { MessageTypes } from '../../utils/message-types';

describe('ChromeAIService', () => {
  let service: ChromeAIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChromeAIService(5); // Small batch size for testing
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
    };
  });

  it('should check availability via message proxy', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });
    const available = await service.isAvailable();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageTypes.CHECK_CHROME_AI_AVAILABILITY,
    });
    expect(available).toBe(true);
  });

  it('should handle availability check failure', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('Failed'));
    const available = await service.isAvailable();
    expect(available).toBe(false);
  });

  it('should categorize tabs in batches', async () => {
    const tabs = [
      { id: 1, title: 'T1', url: 'u1' },
      { id: 2, title: 'T2', url: 'u2' },
      { id: 3, title: 'T3', url: 'u3' },
    ];
    // Set batch size to 2
    const smallBatchService = new ChromeAIService(2);

    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      text: JSON.stringify({
        suggestions: [
          { tabId: 1, groupNames: ['G1'] },
          { tabId: 2, groupNames: ['G2'] },
          { tabId: 3, groupNames: ['G3'] },
        ],
      }),
    });

    const results = await smallBatchService.categorizeTabs(tabs, ['Existing']);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2); // 3 tabs, batch size 2 -> 2 calls
    expect(results.get(1)).toEqual(['G1']);
    expect(results.get(3)).toEqual(['G3']);
  });

  it('should find similar tabs', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      text: JSON.stringify({ similarTabIds: [2] }),
    });

    const reference = { id: 1, title: 'R', url: 'u1' };
    const candidates = [{ id: 2, title: 'C', url: 'u2' }];

    const results = await service.findSimilarTabs(reference, candidates);
    expect(results).toEqual([2]);
  });

  it('should generate window name', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      text: JSON.stringify({ windowName: 'Project' }),
    });

    const name = await service.generateWindowName([{ title: 'T', url: 'u' }], []);
    expect(name).toBe('Project');
  });
});
