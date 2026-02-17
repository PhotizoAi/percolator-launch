/**
 * Market Filter Logic Tests
 * 
 * Tests the leverage filter logic to ensure:
 * 1. Markets with invalid leverage (0 or negative) are excluded from all filters
 * 2. Count consistency between "all" and leverage filters
 * 3. Proper filtering for "5x+", "10x+", "20x+" filters
 */

import { describe, it, expect } from 'vitest';

// Mock market data structure
interface TestMarket {
  name: string;
  maxLeverage: number;
}

// Simulate the filter logic from markets/page.tsx
function applyMarketFilters(
  markets: TestMarket[],
  leverageFilter: "all" | "5x" | "10x" | "20x"
): TestMarket[] {
  // First, exclude markets with invalid leverage (0 or negative) from ALL filters
  let list = markets.filter((m) => m.maxLeverage > 0);
  
  // Apply leverage filter
  if (leverageFilter !== "all") {
    const maxLev = parseInt(leverageFilter);
    list = list.filter((m) => m.maxLeverage >= maxLev);
  }
  
  return list;
}

describe('Market Filter Logic', () => {
  const validMarkets: TestMarket[] = [
    { name: "SOL", maxLeverage: 20 },
    { name: "USDC", maxLeverage: 10 },
    { name: "WIF", maxLeverage: 20 },
    { name: "JUP", maxLeverage: 10 },
    { name: "BONK", maxLeverage: 5 },
    { name: "mSOL", maxLeverage: 15 },
  ];

  const marketsWithInvalidLeverage: TestMarket[] = [
    ...validMarkets,
    { name: "BROKEN1", maxLeverage: 0 },
    { name: "BROKEN2", maxLeverage: -1 },
  ];

  describe('Valid markets only', () => {
    it('should show all valid markets when "all" filter is selected', () => {
      const result = applyMarketFilters(validMarkets, "all");
      expect(result).toHaveLength(6);
      expect(result.map(m => m.name)).toEqual(["SOL", "USDC", "WIF", "JUP", "BONK", "mSOL"]);
    });

    it('should show all markets with 5x+ leverage', () => {
      const result = applyMarketFilters(validMarkets, "5x");
      expect(result).toHaveLength(6);
      expect(result.every(m => m.maxLeverage >= 5)).toBe(true);
    });

    it('should show only markets with 10x+ leverage', () => {
      const result = applyMarketFilters(validMarkets, "10x");
      expect(result).toHaveLength(5);
      expect(result.map(m => m.name)).toEqual(["SOL", "USDC", "WIF", "JUP", "mSOL"]);
      expect(result.every(m => m.maxLeverage >= 10)).toBe(true);
    });

    it('should show only markets with 20x leverage', () => {
      const result = applyMarketFilters(validMarkets, "20x");
      expect(result).toHaveLength(2);
      expect(result.map(m => m.name)).toEqual(["SOL", "WIF"]);
      expect(result.every(m => m.maxLeverage >= 20)).toBe(true);
    });
  });

  describe('Markets with invalid leverage', () => {
    it('should exclude markets with maxLeverage = 0 from "all" filter', () => {
      const result = applyMarketFilters(marketsWithInvalidLeverage, "all");
      expect(result).toHaveLength(6);
      expect(result.every(m => m.maxLeverage > 0)).toBe(true);
      expect(result.find(m => m.name === "BROKEN1")).toBeUndefined();
      expect(result.find(m => m.name === "BROKEN2")).toBeUndefined();
    });

    it('should exclude markets with maxLeverage = 0 from "5x" filter', () => {
      const result = applyMarketFilters(marketsWithInvalidLeverage, "5x");
      expect(result).toHaveLength(6);
      expect(result.every(m => m.maxLeverage >= 5)).toBe(true);
      expect(result.find(m => m.name === "BROKEN1")).toBeUndefined();
      expect(result.find(m => m.name === "BROKEN2")).toBeUndefined();
    });

    it('should maintain count consistency between "all" and "5x" when all valid markets have 5x+ leverage', () => {
      const result_all = applyMarketFilters(marketsWithInvalidLeverage, "all");
      const result_5x = applyMarketFilters(marketsWithInvalidLeverage, "5x");
      
      // Both should show the same markets since all valid markets have >= 5x leverage
      expect(result_all).toHaveLength(result_5x.length);
      expect(result_all.map(m => m.name).sort()).toEqual(result_5x.map(m => m.name).sort());
    });

    it('should exclude negative leverage markets', () => {
      const result = applyMarketFilters(marketsWithInvalidLeverage, "all");
      expect(result.every(m => m.maxLeverage > 0)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty market list', () => {
      const result = applyMarketFilters([], "all");
      expect(result).toHaveLength(0);
    });

    it('should handle market list with only invalid leverage', () => {
      const invalidOnly: TestMarket[] = [
        { name: "BROKEN1", maxLeverage: 0 },
        { name: "BROKEN2", maxLeverage: -5 },
      ];
      const result = applyMarketFilters(invalidOnly, "all");
      expect(result).toHaveLength(0);
    });

    it('should correctly filter markets at exact leverage boundaries', () => {
      const boundaryMarkets: TestMarket[] = [
        { name: "EXACT5", maxLeverage: 5 },
        { name: "EXACT10", maxLeverage: 10 },
        { name: "EXACT20", maxLeverage: 20 },
      ];
      
      // 5x filter should include all (5, 10, 20 all >= 5)
      const result_5x = applyMarketFilters(boundaryMarkets, "5x");
      expect(result_5x).toHaveLength(3);
      
      // 10x filter should include 10 and 20 (>= 10)
      const result_10x = applyMarketFilters(boundaryMarkets, "10x");
      expect(result_10x).toHaveLength(2);
      expect(result_10x.map(m => m.name)).toEqual(["EXACT10", "EXACT20"]);
      
      // 20x filter should include only 20 (>= 20)
      const result_20x = applyMarketFilters(boundaryMarkets, "20x");
      expect(result_20x).toHaveLength(1);
      expect(result_20x.map(m => m.name)).toEqual(["EXACT20"]);
    });
  });

  describe('Count consistency verification', () => {
    it('should never show more markets in "all" than in "5x+" filter when all valid markets have >= 5x leverage', () => {
      const allMarkets = applyMarketFilters(marketsWithInvalidLeverage, "all");
      const fiveXMarkets = applyMarketFilters(marketsWithInvalidLeverage, "5x");
      
      // Since all valid markets have >= 5x leverage, counts should match
      expect(allMarkets.length).toBe(fiveXMarkets.length);
    });

    it('should show decreasing counts as leverage filter increases', () => {
      const count_all = applyMarketFilters(validMarkets, "all").length;
      const count_5x = applyMarketFilters(validMarkets, "5x").length;
      const count_10x = applyMarketFilters(validMarkets, "10x").length;
      const count_20x = applyMarketFilters(validMarkets, "20x").length;
      
      // Counts should be monotonically decreasing or equal
      expect(count_all).toBeGreaterThanOrEqual(count_5x);
      expect(count_5x).toBeGreaterThanOrEqual(count_10x);
      expect(count_10x).toBeGreaterThanOrEqual(count_20x);
    });
  });
});
