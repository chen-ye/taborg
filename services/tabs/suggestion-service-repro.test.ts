import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SuggestionService } from './suggestion-service';

describe('SuggestionService Repro', () => {
  let service: SuggestionService;
  let mockStorage: Record<string, any> = {};
  let storageListeners: Array<(changes: Record<string, any>, area: string) => void> = [];

  beforeEach(() => {
    mockStorage = {};
    storageListeners = [];

    global.chrome = {
      storage: {
        local: {
          get: vi.fn().mockImplementation((key) => {
            if (typeof key === 'string') {
              return Promise.resolve({ [key]: mockStorage[key] });
            }
            return Promise.resolve(mockStorage);
          }),
          set: vi.fn().mockImplementation((items) => {
            const changes: Record<string, any> = {};
            for (const [key, value] of Object.entries(items)) {
              const oldValue = mockStorage[key];
              mockStorage[key] = value;
              changes[key] = { oldValue, newValue: value };
            }
            // Trigger listeners
            storageListeners.forEach((l) => l(changes, 'local'));
            return Promise.resolve();
          }),
        },
        onChanged: {
          addListener: vi.fn().mockImplementation((listener) => {
            storageListeners.push(listener);
          }),
          removeListener: vi.fn().mockImplementation((listener) => {
            storageListeners = storageListeners.filter((l) => l !== listener);
          }),
        },
      },
    } as any;

    service = new SuggestionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger onChanged when suggestions are updated via setSuggestions', async () => {
    const callback = vi.fn();
    service.onChanged(callback);

    await service.setSuggestions('https://example.com', ['Group A']);

    expect(callback).toHaveBeenCalledWith({
      'https://example.com/': ['Group A'],
    });
  });

  it('should trigger onChanged when suggestions are updated via mergeAllSuggestions', async () => {
    const callback = vi.fn();
    service.onChanged(callback);

    await service.mergeAllSuggestions({
      'https://example.com': ['Group B'],
    });

    expect(callback).toHaveBeenCalledWith({
      'https://example.com/': ['Group B'],
    });
  });

  it('should handle external storage changes', () => {
    const callback = vi.fn();
    service.onChanged(callback);

    // Simulate external change
    const changes = {
      'tab-suggestions': {
        oldValue: {},
        newValue: { 'https://external.com/': ['Group C'] },
      },
    };
    storageListeners.forEach((l) => l(changes, 'local'));

    expect(callback).toHaveBeenCalledWith({
      'https://external.com/': ['Group C'],
    });
  });

  it('should NOT trigger for other keys', () => {
    const callback = vi.fn();
    service.onChanged(callback);

    // Simulate external change for another key
    const changes = {
      'other-key': {
        oldValue: 'a',
        newValue: 'b',
      },
    };
    storageListeners.forEach((l) => l(changes, 'local'));

    expect(callback).not.toHaveBeenCalled();
  });

  it('should recover from failures in the queue', async () => {
    // 1. Force a failure
    mockStorage['poison'] = true;
    // We need to inject a failure. since we can't easily change the mock implementation mid-flight for just one call without complex setup,
    // let's try to make the first op fail by mocking local.get to throw once.

    vi.spyOn(global.chrome.storage.local, 'get').mockImplementationOnce(() =>
      Promise.reject(new Error('Storage error')),
    );

    try {
      await service.mergeAllSuggestions({ 'https://fail.com': ['Group F'] });
    } catch (_e) {
      // Expected error
    }

    // 2. Try a second operation
    const callback = vi.fn();
    service.onChanged(callback);

    await service.mergeAllSuggestions({ 'https://success.com': ['Group S'] });

    // 3. Verify it worked
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        'https://success.com/': ['Group S'],
      }),
    );
  });
});
