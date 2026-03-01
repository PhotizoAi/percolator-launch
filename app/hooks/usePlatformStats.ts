"use client";

import { useEffect, useState } from "react";

export interface PlatformStats {
  totalMarkets: number;
  totalVolume24h: number;
  totalOpenInterest: number;
  totalTraders: number;
  trades24h: number;
  updatedAt: string | null;
}

const DEFAULT_STATS: PlatformStats = {
  totalMarkets: 0,
  totalVolume24h: 0,
  totalOpenInterest: 0,
  totalTraders: 0,
  trades24h: 0,
  updatedAt: null,
};

/**
 * Hook to fetch platform-wide statistics from /api/stats.
 * Includes total 24h trading volume across all active markets,
 * consistent with how Jupiter and other Solana perps aggregate volume
 * (indexer-computed sum of all fills in the last 86_400 seconds).
 *
 * Refreshes every 30 seconds.
 */
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PlatformStats = await res.json();
        if (!cancelled) {
          setStats(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load platform stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { stats, loading, error };
}
