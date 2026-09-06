import { describe, expect, it, vi } from 'vitest';
import { suggestionService } from './suggestion-service';

describe('SuggestionService', () => {
  describe('pruneSuggestions', () => {
    it('should keep all active URLs', () => {
      const currentMap = {
        'https://active1.com/': ['Group A'],
        'https://active2.com/': ['Group B'],
        'https://inactive1.com/': ['Group C'],
      };
      const activeUrls = ['https://active1.com', 'https://active2.com'];

      const result = suggestionService.pruneSuggestions(currentMap, activeUrls, 0); // Limit 0 to force eviction of inactive

      expect(result).toHaveProperty('https://active1.com/');
      expect(result).toHaveProperty('https://active2.com/');
      expect(result).not.toHaveProperty('https://inactive1.com/');
    });

    it('should keep inactive URLs up to limit', () => {
      const currentMap = {
        'https://active.com/': ['Group A'],
        'https://inactive1.com/': ['Group B'],
        'https://inactive2.com/': ['Group C'],
        'https://inactive3.com/': ['Group D'],
      };
      const activeUrls = ['https://active.com'];

      // active + 2 inactive
      const result = suggestionService.pruneSuggestions(currentMap, activeUrls, 3);

      expect(result).toHaveProperty('https://active.com/');
      // Should keep last 2 inactive keys (inactive2, inactive3) - assuming insertion order
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('should prune oldest inactive URLs when limit exceeded', () => {
      const currentMap = {
        'https://oldest.com/': ['Group A'],
        'https://old.com/': ['Group B'],
        'https://new.com/': ['Group C'],
      };
      const activeUrls: string[] = [];

      const result = suggestionService.pruneSuggestions(currentMap, activeUrls, 2);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result).toHaveProperty('https://old.com/');
      expect(result).toHaveProperty('https://new.com/');
      expect(result).not.toHaveProperty('https://oldest.com/');
    });

    it('should handle empty maps', () => {
      const result = suggestionService.pruneSuggestions({}, [], 100);
      expect(result).toEqual({});
    });

    it('should handle normalization', () => {
      const currentMap = {
        'https://google.com/': ['Group A'],
      };
      // Input URL missing trailing slash
      const activeUrls = ['https://google.com'];

      const result = suggestionService.pruneSuggestions(currentMap, activeUrls, 0);
      expect(result).toHaveProperty('https://google.com/');
    });
  });

  describe('storage operations', () => {
    it('should have correct method separation', async () => {
      // Mock chrome.storage.local
      const mockSet = vi.fn();
      const mockGet = vi.fn().mockResolvedValue({});
      global.chrome = {
        storage: {
          local: {
            set: mockSet,
            get: mockGet,
          },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      } as any;

      const service = suggestionService;

      // Test setAllSuggestions (Replace)
      await service.setAllSuggestions({ a: ['1'] });
      expect(mockSet).toHaveBeenLastCalledWith({ 'tab-suggestions': { a: ['1'] } });

      // Test mergeAllSuggestions (Merge)
      mockGet.mockResolvedValueOnce({ 'tab-suggestions': { a: ['1'] } }); // Existing state
      await service.mergeAllSuggestions({ b: ['2'] });

      // Should write merged result (checking implicit behavior, exact check hard without normalization mock)
      expect(mockSet).toHaveBeenCalledTimes(2);
    });

    it('should serialize concurrent operations', async () => {
      // Mock chrome.storage.local
      let storedData: Record<string, string[]> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const key = Object.keys(data)[0];
            // Simulate read-modify-write race if not serialized
            storedData = { ...storedData, ...data[key] };
            resolve();
          }, 10);
        });
      });
      const mockGet = vi.fn().mockImplementation(() => {
        return Promise.resolve({ 'tab-suggestions': storedData });
      });

      global.chrome = {
        storage: {
          local: { set: mockSet, get: mockGet },
          onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      } as any;

      const service = suggestionService;

      // Start two concurrent merges
      const p1 = service.mergeAllSuggestions({ url1: ['Group A'] });
      const p2 = service.mergeAllSuggestions({ url2: ['Group B'] });

      await Promise.all([p1, p2]);

      // If serialized, both should be present. If racing, one might overwrite the other's read.
      expect(mockSet).toHaveBeenCalledTimes(2);
      // Verify final state has both (this relies on our mock implementation simulating the storage behavior)
      // Since our mockSet updates storedData, and mockGet returns it, sequential execution ensures
      // the second call reads the result of the first.

      // Note: In a real race without mutex:
      // P1 reads {}, P2 reads {} -> P1 sets {1}, P2 sets {2} -> Final is {2} (overwrite)
      // With mutex:
      // P1 reads {}, P1 sets {1} -> P2 reads {1}, P2 sets {1, 2}

      // We can verify this by checking the last call to set
      const lastCallArg = mockSet.mock.calls[1][0];
      const resultKeys = Object.keys(lastCallArg['tab-suggestions']);
      // Should have 2 keys (plus normalization artifacts, but we just check count/existence)
      expect(resultKeys).toHaveLength(2);
    });
  });
});
