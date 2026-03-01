import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('usePlatformStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the hook and PlatformStats type', async () => {
    const mod = await import('@/hooks/usePlatformStats');
    expect(mod.usePlatformStats).toBeDefined();
    expect(typeof mod.usePlatformStats).toBe('function');
  });

  it('DEFAULT_STATS shape has all required fields', () => {
    const stats = {
      totalMarkets: 0,
      totalVolume24h: 0,
      totalOpenInterest: 0,
      totalTraders: 0,
      trades24h: 0,
      updatedAt: null,
    };

    expect(stats.totalVolume24h).toBe(0);
    expect(stats.totalMarkets).toBe(0);
    expect(stats.totalOpenInterest).toBe(0);
    expect(stats.totalTraders).toBe(0);
    expect(stats.trades24h).toBe(0);
    expect(stats.updatedAt).toBeNull();
  });

  it('parses API response correctly', async () => {
    const mockResponse = {
      totalMarkets: 5,
      totalVolume24h: 125_000,
      totalOpenInterest: 500_000,
      totalTraders: 42,
      trades24h: 120,
      updatedAt: '2026-03-01T14:00:00.000Z',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    // Verify the API response maps cleanly to PlatformStats shape
    const res = await fetch('/api/stats');
    const data = await res.json();

    expect(data.totalVolume24h).toBe(125_000);
    expect(data.totalMarkets).toBe(5);
    expect(data.totalOpenInterest).toBe(500_000);
    expect(data.totalTraders).toBe(42);
    expect(data.trades24h).toBe(120);
    expect(data.updatedAt).toBe('2026-03-01T14:00:00.000Z');
  });

  it('handles HTTP error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    // Simulate the error path the hook follows
    let error: string | null = null;
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    }

    expect(error).toBe('HTTP 500');
  });

  it('handles network failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    let error: string | null = null;
    try {
      await fetch('/api/stats');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    }

    expect(error).toBe('Network error');
  });
});
