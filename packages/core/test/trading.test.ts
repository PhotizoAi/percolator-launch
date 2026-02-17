/**
 * Test suite for trading math functions
 */

import { computeLiqPrice, computeMarkPnl } from "../src/math/trading.js";

function assertEqual(actual: bigint, expected: bigint, msg: string) {
  if (actual !== expected) {
    throw new Error(
      `${msg}\n  Expected: ${expected}\n  Actual: ${actual}`
    );
  }
}

function assertGreaterThan(actual: bigint, threshold: bigint, msg: string) {
  if (actual <= threshold) {
    throw new Error(
      `${msg}\n  Expected: > ${threshold}\n  Actual: ${actual}`
    );
  }
}

console.log("Testing computeLiqPrice...");

// Test 1: Long position with normal margin (5%)
// Example: 1 SOL position (in lamports) at $100 entry, with 0.1 SOL capital
const liqPriceLong = computeLiqPrice(
  100_000_000n,     // entry $100 (in e6)
  100_000_000n,     // capital 0.1 SOL (100M lamports)
  1_000_000_000n,   // position size 1 SOL (1B lamports)
  500n              // 5% maintenance margin
);
// capitalPerUnitE6 = (100M * 1M) / 1B = 100000
// adjusted = (100000 * 10000) / 10500 = 95238
// liq = 100e6 - 95238 = 99904762
assertEqual(liqPriceLong, 99_904_762n, "Long position liq price with 5% margin");

// Test 2: Short position with normal margin (5%)
const liqPriceShort = computeLiqPrice(
  100_000_000n,     // entry $100
  100_000_000n,     // capital 0.1 SOL
  -1_000_000_000n,  // position size -1 SOL (short)
  500n              // 5% maintenance margin
);
// capitalPerUnitE6 = 100000
// adjusted = (100000 * 10000) / 9500 = 105263
// liq = 100e6 + 105263 = 100105263
assertEqual(liqPriceShort, 100_105_263n, "Short position liq price with 5% margin");

// Test 3: Zero position returns 0
assertEqual(
  computeLiqPrice(100_000_000n, 100_000_000n, 0n, 500n),
  0n,
  "Zero position returns 0"
);

// Test 4: Zero entry price returns 0
assertEqual(
  computeLiqPrice(0n, 100_000_000n, 1_000_000_000n, 500n),
  0n,
  "Zero entry price returns 0"
);

// Test 5: Long position with high margin (50%)
const liqPriceLongHigh = computeLiqPrice(
  100_000_000n,     // entry $100
  5_000_000_000n,   // capital 5 SOL (higher capital)
  1_000_000_000n,   // position size 1 SOL
  5000n             // 50% maintenance margin
);
// capitalPerUnitE6 = (5B * 1M) / 1B = 5000000
// adjusted = (5000000 * 10000) / 15000 = 3333333
// liq = 100e6 - 3333333 = 96666667
assertEqual(liqPriceLongHigh, 96_666_667n, "Long position with 50% margin");

// Test 6: Short position with high margin (50%)
const liqPriceShortHigh = computeLiqPrice(
  100_000_000n,
  5_000_000_000n,
  -1_000_000_000n,
  5000n
);
// adjusted = (5000000 * 10000) / 5000 = 10000000
// liq = 100e6 + 10000000 = 110000000
assertEqual(liqPriceShortHigh, 110_000_000n, "Short position with 50% margin");

// Test 7: CRITICAL - Short position with 100% maintenance margin should be unliquidatable
const liqPriceShort100 = computeLiqPrice(
  100_000_000n,
  100_000_000n,
  -1_000_000_000n,
  10000n        // 100% maintenance margin
);
// Should return max u64 (effectively unliquidatable)
assertEqual(
  liqPriceShort100,
  18446744073709551615n,
  "Short with 100% margin returns max u64 (unliquidatable)"
);

// Test 8: Short position with >100% margin (120%)
const liqPriceShort120 = computeLiqPrice(
  100_000_000n,
  100_000_000n,
  -1_000_000_000n,
  12000n        // 120% maintenance margin
);
assertEqual(
  liqPriceShort120,
  18446744073709551615n,
  "Short with >100% margin returns max u64 (unliquidatable)"
);

// Test 9: Long position with 100% margin still has valid liq price
const liqPriceLong100 = computeLiqPrice(
  100_000_000n,
  10_000_000_000n,   // 10 SOL capital
  1_000_000_000n,    // 1 SOL position
  10000n
);
// capitalPerUnitE6 = 10000000
// adjusted = (10000000 * 10000) / 20000 = 5000000
// liq = 100e6 - 5000000 = 95000000
assertEqual(liqPriceLong100, 95_000_000n, "Long with 100% margin still liquidatable");

// Test 10: Long position with very high margin (200%)
const liqPriceLong200 = computeLiqPrice(
  100_000_000n,
  20_000_000_000n,   // 20 SOL capital
  1_000_000_000n,    // 1 SOL position
  20000n
);
// capitalPerUnitE6 = 20000000
// adjusted = (20000000 * 10000) / 30000 = 6666666
// liq = 100e6 - 6666666 = 93333334
assertEqual(liqPriceLong200, 93_333_334n, "Long with 200% margin");

// Test 11: Short near boundary (99.99% margin)
const liqPriceShortBoundary = computeLiqPrice(
  100_000_000n,
  1_000_000_000n,    // 1 SOL capital
  -1_000_000_000n,   // -1 SOL position
  9999n
);
// capitalPerUnitE6 = 1000000
// adjusted = (1000000 * 10000) / 1 = 10000000000
// liq = 100e6 + 10000000000 = 10100000000
assertEqual(liqPriceShortBoundary, 10_100_000_000n, "Short with 99.99% margin");

// Test 12: Edge case - very small capital vs position
const liqPriceSmallCap = computeLiqPrice(
  100_000_000n,
  1_000_000n,        // 0.001 SOL capital (tiny)
  1_000_000_000n,    // 1 SOL position
  500n
);
// capitalPerUnitE6 = (1M * 1M) / 1B = 1000
// adjusted = (1000 * 10000) / 10500 = 952
// liq = 100e6 - 952 = 99999048
assertEqual(liqPriceSmallCap, 99_999_048n, "Small capital has liq price close to entry");

console.log("\nTesting computeMarkPnl...");

// Test basic long profit
// 1 SOL long at $100, now at $110
const pnlLongProfit = computeMarkPnl(
  1_000_000_000n,   // long 1 SOL
  100_000_000n,     // entry $100
  110_000_000n      // oracle $110
);
// = (110e6 - 100e6) * 1B / 110e6
// = 10e6 * 1B / 110e6
// = 10B / 110e6
// = 90909090
assertEqual(pnlLongProfit, 90_909_090n, "Long position profit");

// Test basic short profit
// 1 SOL short at $100, now at $90
const pnlShortProfit = computeMarkPnl(
  -1_000_000_000n,  // short 1 SOL
  100_000_000n,     // entry $100
  90_000_000n       // oracle $90
);
// = (100e6 - 90e6) * 1B / 90e6
// = 10e6 * 1B / 90e6
// = 111111111
assertEqual(pnlShortProfit, 111_111_111n, "Short position profit");

// Test zero position
assertEqual(
  computeMarkPnl(0n, 100_000_000n, 110_000_000n),
  0n,
  "Zero position has zero PnL"
);

// Test zero oracle
assertEqual(
  computeMarkPnl(1_000_000_000n, 100_000_000n, 0n),
  0n,
  "Zero oracle returns zero PnL"
);

console.log("\n✅ All tests passed!");
