# Pull Request Submission Guide

## ✅ Clean Branch Ready for Contribution

A clean branch `fix/liquidation-price-short-positions` has been created with only the liquidation price fix, ready for PR submission.

## Branch Information

**Branch Name**: `fix/liquidation-price-short-positions`  
**Base Branch**: `main` (commit ecab07f)  
**Commit Hash**: bab3367  
**Status**: ✅ All tests passing (12/12)

## What's Included

This branch contains ONLY the following changes:

### 1. Core Fix (4 lines changed)
**File**: `packages/core/src/math/trading.ts`

```typescript
// Before (incorrect):
if (maintenanceMarginBps >= 10000n) return entryPrice;

// After (correct):
// Short positions liquidate when price rises. With >= 100% margin, they have enough
// collateral to cover any price increase, so return max u64 to indicate "never liquidated"
if (maintenanceMarginBps >= 10000n) return 18446744073709551615n; // max u64
```

### 2. Test Suite (203 lines)
**File**: `packages/core/test/trading.test.ts`
- 12 comprehensive test cases
- Covers edge cases: 0%, 5%, 50%, 99.99%, 100%, 120%, 200% margins
- All tests passing

### 3. Test Script Update (1 line)
**File**: `packages/core/package.json`
- Added trading tests to test script

### 4. Dependency Updates
**Files**: `packages/core/package-lock.json`, `package-lock.json`
- Updated for test dependencies only

## How to Submit the Pull Request

### Option 1: If You Have a Fork

1. **Add your fork as a remote**:
   ```bash
   cd /home/runner/work/percolator-launch/percolator-launch
   git remote add fork https://github.com/YOUR_USERNAME/percolator-launch.git
   ```

2. **Push the branch to your fork**:
   ```bash
   git push fork fix/liquidation-price-short-positions
   ```

3. **Create PR on GitHub**:
   - Go to https://github.com/YOUR_USERNAME/percolator-launch
   - Click "Compare & pull request" button
   - Set base: `PhotizoAi/percolator-launch` (main branch)
   - Set compare: `YOUR_USERNAME/percolator-launch` (fix/liquidation-price-short-positions)
   - Use the PR template below
   - Submit!

### Option 2: If You Don't Have a Fork Yet

1. **Fork the repository**:
   - Go to https://github.com/PhotizoAi/percolator-launch
   - Click "Fork" button

2. **Add fork remote and push**:
   ```bash
   cd /home/runner/work/percolator-launch/percolator-launch
   git remote add fork https://github.com/YOUR_USERNAME/percolator-launch.git
   git push fork fix/liquidation-price-short-positions
   ```

3. **Create PR** (same as Option 1, step 3)

## Pull Request Template

### Title
```
Fix liquidation price for over-collateralized short positions
```

### Description
```markdown
## Problem

Short positions with ≥100% maintenance margin incorrectly returned `entryPrice` as the liquidation price, suggesting liquidation would occur at entry. This caused the UI to display 0% liquidation health when the position is actually unliquidatable.

## Root Cause

For short positions, liquidation occurs when price rises above the liquidation price. With ≥100% maintenance margin, the denominator `(10000 - maintenanceMarginBps)` becomes ≤0, triggering a guard that returned `entryPrice`. However, this is semantically incorrect—the position can never be liquidated.

## Solution

Changed the guard to return max u64 (`18446744073709551615n`) to represent an effectively infinite liquidation price:

```typescript
// Short positions liquidate when price rises. With >= 100% margin, they have enough
// collateral to cover any price increase, so return max u64 to indicate "never liquidated"
if (maintenanceMarginBps >= 10000n) return 18446744073709551615n; // max u64
```

## Changes

- **Core Fix**: `packages/core/src/math/trading.ts` (4 lines)
- **Test Suite**: `packages/core/test/trading.test.ts` (203 lines, 12 test cases)
- **Test Script**: Updated `packages/core/package.json` to include new tests

## Testing

✅ All 12 tests pass:
1. Long position with 5% margin
2. Short position with 5% margin
3. Zero position returns 0
4. Zero entry price returns 0
5. Long with 50% margin
6. Short with 50% margin
7. **Short with 100% margin** (critical fix verification)
8. **Short with 120% margin** (critical fix verification)
9. Long with 100% margin (still liquidatable)
10. Long with 200% margin
11. Short with 99.99% margin (boundary test)
12. Small capital edge case

## Impact

**UI Behavior**:
- AccountsCard: Liquidation health now correctly shows ~100% for over-collateralized shorts (was 0%)
- PositionPanel: Displays liquidation price as "$18,446,744,073,709.55" (effectively infinite)

**Compatibility**:
- ✅ No breaking changes
- ✅ Long positions unaffected
- ✅ Short positions with <100% margin unaffected
- ✅ Only fixes the broken edge case (≥100% margin shorts)

**Security**:
- ✅ CodeQL scan: 0 vulnerabilities
- ✅ Display-only function (not sent to on-chain program)

## Verification

- [x] All tests pass (12/12)
- [x] Code review completed (0 issues)
- [x] Security scan completed (0 vulnerabilities)
- [x] Build successful
- [x] Clean commit history
```

## Verification Commands

To verify the branch locally:

```bash
# Switch to the branch
git checkout fix/liquidation-price-short-positions

# View the changes
git diff main..HEAD

# Run tests
cd packages/core
npx tsx test/trading.test.ts

# Build the package
npm run build
```

## Additional Notes

### Why This Branch is Clean

This branch was created by:
1. Checking out the latest `main` branch from origin
2. Creating a new branch from `main`
3. Cherry-picking ONLY the fix commit
4. Resolving conflicts in package-lock.json (dependency updates)
5. Verifying all tests pass

### What's NOT Included

This branch does NOT contain:
- Any other changes from the repository
- Any work-in-progress commits
- Any unrelated fixes or features
- Any changes to other packages or modules

### Branch Comparison

You can view exactly what changed from main:
```bash
git log main..fix/liquidation-price-short-positions
git diff main..fix/liquidation-price-short-positions
```

## Questions?

If you encounter any issues during submission, check:

1. **Push fails**: Make sure you're pushing to your fork, not the main repo
2. **Tests fail**: Ensure you have dependencies installed (`npm install`)
3. **Merge conflicts**: This branch is based on latest main, should have no conflicts

## Success Criteria

Your PR is ready when:
- ✅ Branch is pushed to your fork
- ✅ PR is created on GitHub pointing to PhotizoAi/percolator-launch:main
- ✅ All CI checks pass (if configured)
- ✅ Description clearly explains the fix

---

**Branch created**: 2026-02-17  
**Status**: ✅ Ready for submission  
**Maintainer**: Review the commit bab3367 for complete details
