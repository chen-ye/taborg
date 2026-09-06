import { describe, expect, it, vi } from 'vitest';
import { processingStateService } from './processing-state-service';

describe('ProcessingStateService', () => {
  it('should serialize concurrent updates', async () => {
    // Mock session storage
    let sessionData: Record<string, number[]> = {};
    const mockSet = vi.fn().mockImplementation((data) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const key = Object.keys(data)[0];
          sessionData = { ...sessionData, ...data[key] };
          if (data['processing-tabs']) {
            sessionData['processing-tabs'] = data['processing-tabs'];
          }
          resolve();
        }, 10);
      });
    });
    const mockGet = vi.fn().mockImplementation(() => {
      return Promise.resolve({ 'processing-tabs': sessionData['processing-tabs'] });
    });

    global.chrome = {
      storage: {
        session: { set: mockSet, get: mockGet },
      },
    } as any;

    const service = processingStateService;

    // Simulate two concurrent additions
    // P1 reads [], adds [1], writes [1]
    // P2 reads [], adds [2], writes [2] -> if racing, we lose one.
    // With mutex: P1 reads [], writes [1] -> P2 reads [1], writes [1, 2]

    const p1 = service.addTabs([1]);
    const p2 = service.addTabs([2]);

    await Promise.all([p1, p2]);

    expect(mockSet).toHaveBeenCalledTimes(2);
    const lastCallArg = mockSet.mock.calls[1][0];
    const finalIds = lastCallArg['processing-tabs'];
    expect(finalIds).toContain(1);
    expect(finalIds).toContain(2);
    expect(finalIds).toHaveLength(2);
  });
});
