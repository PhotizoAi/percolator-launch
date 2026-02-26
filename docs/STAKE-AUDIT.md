# percolator-stake Comprehensive Security Audit

**Date:** 2026-02-26  
**Auditor:** Cobra (automated — line-by-line, function-by-function review)  
**Target repo:** https://github.com/dcccrypto/percolator-stake  
**Target commit:** `878c7b023e8800848122513f9534c1a38f978a98`  
**Scope:** All 8 source files (~2,600 lines): `lib.rs`, `entrypoint.rs`, `error.rs`, `state.rs`, `math.rs`, `instruction.rs`, `processor.rs`, `cpi.rs`  
**Test coverage:** 141 unit tests + 33 Kani formal-verification proofs

---

## Executive Summary

The percolator-stake program manages insurance-LP staking for Percolator markets.
Users deposit collateral into a vault, receive pro-rata LP tokens, and the admin
periodically flushes vault funds to the wrapper's insurance fund via CPI.  
After market resolution, the admin withdraws insurance back to the vault so LP
holders can redeem.

Over four audit rounds (C0–C10, H1–H6, M1–M7, L1–L4) **11 critical and 15
additional** findings were identified and resolved.  This final round adds
**8 new findings** (N1–N8) discovered during this independent review.

**Overall verdict:** The program is substantially hardened.  All previously
identified critical vulnerabilities are fixed.  The remaining open items are
low-severity or informational.

---

## Architecture Overview

```
Admin (human keypair)
  │
  ▼ InitPool                   ┌──────────────────────┐
stake_pool PDA ─────────────────► Pool state + accounting│
  │ (becomes wrapper admin)    └──────────────────────┘
  │
  ├── vault_auth PDA  ──────────── vault token account (collateral buffer)
  │       │                             ▲ Deposit / ▼ Withdraw
  │       └── LP mint (6 decimals)      │
  │                                     │ FlushToInsurance
  │                                     ▼
  └── percolator wrapper slab ──── wrapper insurance fund
            (CPI)
```

**PDAs:**
| Account | Seeds |
|---------|-------|
| `stake_pool` | `[b"stake_pool", slab_pubkey]` |
| `vault_auth` | `[b"vault_auth", pool_pda]` |
| `stake_deposit` | `[b"stake_deposit", pool_pda, user_pubkey]` |
| `lp_mint` | (arbitrary, stored in pool state) |
| `vault` | (arbitrary, stored in pool state) |

---

## Round-by-Round Findings

### Round 1 (Initial Audit)

---

#### C0 · CPI Tag Mismatch — Wrong Instructions Called (CRITICAL — FIXED)

**File:** `cpi.rs`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED (commit `26a3565`)

The CPI helpers originally used wrong tag numbers:

| Function | Old tag | Old instruction | Correct tag | Correct instruction |
|----------|---------|-----------------|-------------|---------------------|
| `cpi_set_insurance_withdraw_policy` | 22 | `UpdateRiskParams` | 30 | `SetInsuranceWithdrawPolicy` |
| `cpi_withdraw_insurance_limited` | 23 | `RenounceAdmin` | 31 | `WithdrawInsuranceLimited` |

**Impact:** Calling `RenounceAdmin` (tag 23) during `AdminWithdrawInsurance` would
have permanently removed the pool PDA as wrapper admin, locking all subsequent
admin operations forever.  Calling `UpdateRiskParams` (tag 22) would silently
corrupt risk parameters with arbitrary data.

**Fix:** Updated constants to `TAG_SET_INSURANCE_WITHDRAW_POLICY = 30` and
`TAG_WITHDRAW_INSURANCE_LIMITED = 31`, aligned with `percolator-launch/program/src/tags.rs`.

---

#### C1 · Saturating Subtraction on LP Supply (CRITICAL — FIXED)

**File:** `processor.rs` — `process_withdraw`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

`total_lp_supply` used `saturating_sub` on withdrawal, silently wrapping to 0
on under-flow.  An LP supply of 0 makes all subsequent deposits 1:1 (first-depositor
path), allowing theft of the entire pool.

**Fix:** Changed to `checked_sub(...).ok_or(StakeError::Overflow)?`.

---

#### C2 · Saturating Subtraction on Deposit LP Amount (CRITICAL — FIXED)

**File:** `processor.rs` — `process_withdraw`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

`deposit.lp_amount` used `saturating_sub`, silently allowing a user's recorded
balance to underflow to 0 without actually burning the correct LP tokens.

**Fix:** Changed to `checked_sub(...).ok_or(StakeError::InsufficientLpTokens)?`.

---

#### C3 · `total_returned` Never Updated (CRITICAL — FIXED)

**File:** `processor.rs` — `process_admin_withdraw_insurance`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

After insurance was withdrawn back to the vault, `pool.total_returned` was not
incremented.  `total_pool_value()` did not account for returned funds, causing
the pool value to appear lower than reality.  LP holders would receive less
collateral than they were entitled to.

**Fix:** Added `pool.total_returned += amount` (with overflow check) at the end
of `process_admin_withdraw_insurance`.

---

#### C4 · `pool_value` Formula Missing `total_returned` (CRITICAL — FIXED)

**File:** `state.rs` — `total_pool_value`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED (then corrected again in C8)

The initial formula `deposited - withdrawn` did not subtract flushed funds or add
returned funds, producing an inflated pool value.

---

#### C5 · Missing `percolator_program` Validation in Admin CPIs (CRITICAL — FIXED)

**File:** `processor.rs` — admin functions  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

Admin CPI functions did not verify that the `percolator_program` account matched
`pool.percolator_program`.  An attacker who is the pool admin could pass a
malicious program, receive the pool PDA's signer authority via `invoke_signed`,
and drain the vault.

**Fix:** Added `pool.percolator_program != percolator_program.key.to_bytes()`
checks in `validate_admin_cpi` and `process_flush_to_insurance`.

---

#### C6 · Missing `verify_token_program` in `process_deposit` (CRITICAL — FIXED)

**File:** `processor.rs` — `process_deposit`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

Without token program validation, an attacker could pass a fake SPL token
program.  The vault_auth PDA signs via `invoke_signed`; the fake program
receives PDA signer authority and can drain the vault.

**Fix:** Added `verify_token_program(token_program)?` before any `invoke_signed`.

---

#### C7 · Missing `verify_token_program` in `process_withdraw` (CRITICAL — FIXED)

**File:** `processor.rs` — `process_withdraw`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED — same class as C6.

---

#### C8 · `pool_value` Formula Causes Insolvency — Missing `−flushed +returned` (CRITICAL — FIXED)

**File:** `state.rs` — `total_pool_value`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED

The correct formula is:

```
pool_value = deposited − withdrawn − flushed + returned
```

Without subtracting `total_flushed`, LP withdrawals were calculated against a
larger-than-real pool value, paying out more collateral than was in the vault.
The vault would run dry before all LP holders could withdraw.

**Fix:** Formula is now implemented as:
```rust
pub fn total_pool_value(&self) -> Option<u64> {
    self.total_deposited
        .checked_sub(self.total_withdrawn)?
        .checked_sub(self.total_flushed)?
        .checked_add(self.total_returned)
}
```

---

#### C9 · First-Depositor LP Theft via Orphaned Insurance Returns (CRITICAL — FIXED)

**File:** `math.rs` — `calc_lp_for_deposit`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED (commit `862130e`)

The first-depositor gate used `||` (OR) instead of `&&` (AND):

```rust
// BEFORE (vulnerable):
if supply == 0 || pool_value == 0 { Some(deposit) }

// AFTER (fixed):
if supply == 0 && pool_value == 0 { Some(deposit) }
else if supply == 0 || pool_value == 0 { None }
```

**Attack — Orphaned Insurance Theft:**
1. Users deposit 1 000 tokens, receive 1 000 LP.
2. Admin flushes 500 to insurance (vault still holds 500).
3. All LP holders withdraw their proportional 500 (LP_supply → 0).
4. Market resolves; `AdminWithdrawInsurance` returns 500 tokens to vault.
5. State: LP_supply = 0, pool_value = 500 (orphaned).
6. Attacker deposits 1 token → OLD code: supply = 0, so 1:1 → gets 1 LP.
7. pool_value = 501, LP_supply = 1.  Attacker burns 1 LP → receives 501 tokens.
8. **Net theft: 500 tokens** (all returned insurance).

**Dilution vector (supply > 0, value = 0):**  
If pool is fully flushed (value = 0) but LP holders remain, a new depositor at 1:1
dilutes their claim on future insurance returns.  Also blocked by the fix.

**Formal verification:** 3 new Kani proofs confirm all three cases (orphaned value
blocked, dilution blocked, true-first-depositor accepted).

---

#### C10 · FlushToInsurance Permissionless — DoS of All LP Withdrawals (CRITICAL — FIXED)

**File:** `processor.rs` — `process_flush_to_insurance`  
**Severity:** CRITICAL  
**Status:** ✅ FIXED (commit `862130e`)

`process_flush_to_insurance` required only `caller.is_signer` — no admin check.
Any signer could drain the entire stake vault to the wrapper insurance fund.

**Impact:**
- All LP holder withdrawals return 0 (vault empty, transfer fails).
- Funds locked until market resolves and admin calls `AdminWithdrawInsurance`.
- Duration could be months or years.

**Fix:**
```rust
if pool.admin != caller.key.to_bytes() {
    return Err(StakeError::Unauthorized.into());
}
```

---

### Round 2 (High-Severity Findings)

---

#### H1 · No `admin_transferred` Check in Deposit — Accepted, Then Fixed (HIGH — FIXED)

**File:** `processor.rs` — `process_deposit`  
**Severity:** HIGH  
**Status:** ✅ FIXED (commit `3be26b7`)

Users could deposit into a pool before `TransferAdmin` completed.  The stake
program would not yet have admin authority over the wrapper slab, so it could
not protect depositor funds.  Deposits now require `pool.admin_transferred == 1`.

---

#### H3/H4 · CPI `AccountMeta` Signer Flags Incorrect (HIGH — FIXED)

**File:** `cpi.rs` — `cpi_withdraw_insurance_limited`  
**Severity:** HIGH  
**Status:** ✅ FIXED

`slab`, `stake_vault`, and `wrapper_vault` were incorrectly marked as signers in the
`AccountMeta` list.  Non-signer accounts must use `AccountMeta::new(*key, false)`.
Solana rejects instructions where an account claims to be a signer but cannot sign.

---

#### H5 · Trailing Bytes Ignored in Instruction Deserialization (HIGH — ACCEPTED)

**File:** `instruction.rs` — `unpack`  
**Severity:** HIGH  
**Status:** ⚠️ ACCEPTED

Extra bytes after a valid instruction payload are silently ignored.  This matches
standard Solana practice (forward-compatible ABI).  Risk is low because instruction
tag validation is strict.

---

#### H6 · Deposit Cap Uses Lifetime `total_deposited` — Permanent Pool Lockout (HIGH — FIXED)

**File:** `processor.rs` — `process_deposit`  
**Severity:** HIGH  
**Status:** ✅ FIXED (commit `862130e`)

The cap was checked against the monotonically-increasing `total_deposited`, not
the current pool value.  Once the cap was hit (even temporarily), no further
deposits were ever possible regardless of subsequent withdrawals.

```rust
// BEFORE (broken):
let new_total = pool.total_deposited.checked_add(amount)?;
if new_total > pool.deposit_cap { return Err(...) }

// AFTER (correct):
let current_value = pool.total_pool_value().unwrap_or(0);
let new_value = current_value.checked_add(amount)?;
if new_value > pool.deposit_cap { return Err(...) }
```

---

### Round 3 (Medium-Severity Findings)

---

#### M2 · No Struct Versioning (MEDIUM — FIXED)

**File:** `state.rs` — `StakePool`, `StakeDeposit`  
**Severity:** MEDIUM  
**Status:** ✅ FIXED (commit `3be26b7`)

8-byte discriminators and a version byte are now written at initialization
(`set_discriminator()`).  `validate_discriminator()` accepts zeroed-reserved
(pre-upgrade) accounts for backward compatibility.  Version 1 is current.

---

#### M3 · Missing `deposit.pool` Validation in `process_withdraw` (MEDIUM — FIXED)

**File:** `processor.rs` — `process_withdraw`  
**Severity:** MEDIUM  
**Status:** ✅ FIXED

A user could pass a `deposit_pda` belonging to a different pool.  The fix checks
`deposit.pool == pool_pda.key.to_bytes()` before proceeding.

---

#### M4 · No Reentrancy Guard (MEDIUM — ACCEPTED)

**Severity:** MEDIUM  
**Status:** ⚠️ ACCEPTED

Solana's account-locking model prevents reentrancy at the runtime level.  A CPI
callee cannot invoke back into the same program in a way that bypasses the
borrow already held by the outer call.

---

#### M5/M6 · Missing Vault Pubkey Validation in Withdraw / Flush (MEDIUM — FIXED)

**File:** `processor.rs`  
**Severity:** MEDIUM  
**Status:** ✅ FIXED

Both `process_withdraw` and `process_flush_to_insurance` now verify
`pool.vault == vault.key.to_bytes()` before any token operations.

---

#### M7 · TransferAdmin Missing Pool Admin Authorization (MEDIUM — FIXED)

**File:** `processor.rs` — `process_transfer_admin`  
**Severity:** MEDIUM  
**Status:** ✅ FIXED (commit `862130e`)

`process_transfer_admin` checked `current_admin.is_signer` but not
`pool.admin == current_admin.key`.  Someone who happened to be the wrapper admin
but was not the pool admin could trigger the transfer, creating a split-authority
scenario.

**Fix:** Added `pool.admin != current_admin.key.to_bytes()` check.

---

### Round 4 (Final Adversarial Deep-Audit — see above for C9/C10)

### Round 5 (Low-Severity / Informational)

---

#### L1 · Collateral Mint Not Validated Against Slab (LOW — DOCUMENTED)

The `collateral_mint` passed at `InitPool` is stored but never validated against
the wrapper slab's collateral mint.  A misconfigured pool would be rejected by
the wrapper's CPI on first use.  Since the admin is trusted at init time, risk
is acceptable.

---

#### L2 · No Structured Event Emission (LOW — ACCEPTED)

All events use `msg!()` which is off-chain-readable but not indexable without
log parsing.  Structured events would improve indexer reliability.  Current
`msg!()` logging is sufficient for devnet and early mainnet.

---

#### L3 · No Independent Vault Ownership Verification in CPI (LOW — ACCEPTED)

The stake program does not independently verify the SPL token account ownership
on vault accounts before CPI.  The wrapper program performs this check.
Defense-in-depth would add local verification.

---

#### L4 · `saturating_sub` in `flush_available` (LOW — FIXED)

**File:** `math.rs` — `flush_available`  
**Status:** ✅ FIXED

Changed to explicit under-flow detection to prevent silent accounting errors.

---

## New Findings (This Review)

---

#### N1 · Dead Code: `cpi_withdraw_insurance` (Tag 20) (INFO)

**File:** `cpi.rs`  
**Severity:** INFO  
**Status:** ⚠️ OPEN — RECOMMEND CLEANUP

`process_admin_withdraw_insurance` calls `cpi_withdraw_insurance_limited`
(Tag 31), not `cpi_withdraw_insurance` (Tag 20).  The original Tag 20 function
(which uses the admin PDA as signer and calls `WithdrawInsurance` rather than
`WithdrawInsuranceLimited`) is now unreachable from the processor.

This is not a security issue but dead code can cause confusion about which path
is active.  Recommend documenting or removing `cpi_withdraw_insurance`.

---

#### N2 · Stale Tag Numbers in CPI Section-Header Comments (LOW)

**File:** `cpi.rs`  
**Severity:** LOW — documentation inconsistency  
**Status:** ⚠️ OPEN — RECOMMEND FIX

The section-header comments for `cpi_set_insurance_withdraw_policy` and
`cpi_withdraw_insurance_limited` still reference the old (incorrect) tag numbers:

```rust
// SetInsuranceWithdrawPolicy (Tag 21) — admin only, requires RESOLVED
// ...
pub fn cpi_set_insurance_withdraw_policy<'a>(...)
```

```rust
// WithdrawInsuranceLimited (Tag 22) — policy authority, requires RESOLVED
// ...
pub fn cpi_withdraw_insurance_limited<'a>(...)
```

The actual constants used are `TAG_SET_INSURANCE_WITHDRAW_POLICY = 30` and
`TAG_WITHDRAW_INSURANCE_LIMITED = 31`.  The comments are holdovers from before
the C0 tag collision fix.  A developer reading these comments would believe the
wrong tags are in use.

**Recommendation:** Update comments to read "Tag 30" and "Tag 31" respectively.

---

#### N3 · `process_admin_withdraw_insurance` Calls `find_program_address` at Runtime (INFO)

**File:** `processor.rs` — `process_admin_withdraw_insurance`  
**Severity:** INFO — compute budget waste  
**Status:** ⚠️ INFORMATIONAL

```rust
let (expected_vault_auth, vault_auth_bump) = Pubkey::find_program_address(
    &[b"vault_auth", pool_pda.key.as_ref()],
    program_id,
);
```

`find_program_address` iterates nonces 0–255 until a valid off-curve key is found
(worst case ~255 SHA-256 hashes).  The bump is already stored in
`pool.vault_authority_bump`.  Using the stored bump via `create_program_address`
would be O(1).

All other bump re-derivations in the codebase share this pattern (`process_deposit`,
`process_withdraw`, `process_flush_to_insurance`).  None are exploitable, but
all waste compute budget on every call.

**Recommendation:** Use `state::create_program_address_with_nonce` (or
`Pubkey::create_program_address`) with `pool.vault_authority_bump` instead of
re-calling `find_program_address`.

---

#### N4 · `process_flush_to_insurance` Does Not Call `verify_token_program` (LOW)

**File:** `processor.rs` — `process_flush_to_insurance`  
**Severity:** LOW (mitigated)  
**Status:** ⚠️ OPEN — RECOMMEND FIX

`process_deposit` and `process_withdraw` both call `verify_token_program(token_program)?`
before any `invoke_signed`.  `process_flush_to_insurance` does not.

In flush, the `token_program` is passed to `cpi_top_up_insurance`, which passes
it to the percolator program.  The percolator program validates the token program
itself (consistent with C6/C7 being fixed there too).  Additionally, `percolator_program`
is validated against `pool.percolator_program`, so a fake percolator cannot be
substituted.

**Mitigating factors:** `pool.percolator_program` is validated; the real percolator
program validates its own token_program.  Direct vault drain via fake token program
is not possible through this path.

**Recommendation:** Add `verify_token_program(token_program)?` for defense-in-depth
and code consistency with the other handlers.

---

#### N5 · `process_admin_withdraw_insurance` Does Not Validate `stake_vault == pool.vault` (LOW)

**File:** `processor.rs` — `process_admin_withdraw_insurance`  
**Severity:** LOW  
**Status:** ⚠️ OPEN

The admin can pass any token account as `stake_vault` (the destination for
returned insurance).  The code validates `vault_auth` derivation but not that
`stake_vault` is `pool.vault`.

**Impact:** A trusted admin could accidentally (or intentionally) route insurance
to a different `vault_auth`-controlled token account.  LP holders would not receive
credit for the returned funds since `total_returned` is incremented regardless.
Subsequent withdrawals would compute collateral proportions against an incorrectly-
inflated `total_pool_value`, but the vault would be short.

**Mitigating factors:** The admin is a trusted keypair.  After the vault shortage
is discovered, the admin can deposit collateral to cover the gap.

**Recommendation:** Add `if pool.vault != stake_vault.key.to_bytes() { return Err(...) }`.

---

#### N6 · LP Mint Decimals Hardcoded to 6 (INFO)

**File:** `processor.rs` — `process_init_pool`  
**Severity:** INFO — design limitation  
**Status:** ⚠️ INFORMATIONAL

```rust
spl_token::instruction::initialize_mint(
    token_program.key,
    lp_mint.key,
    vault_auth.key,
    Some(vault_auth.key),
    6,  // hardcoded
)?
```

LP mint decimals are hardcoded to 6.  This matches USDC (6 decimals) but would
be incorrect for SOL-denominated pools (9 decimals) or other collateral types.
Decimal mismatch is a UX/display issue — it does not affect accounting since
LP amounts are tracked in raw integer units on-chain.

**Recommendation:** Accept a `lp_decimals: u8` parameter in `InitPool` and
validate it matches the collateral mint's decimals.

---

#### N7 · `total_returned` Not Bounded By `total_flushed` (INFO)

**File:** `processor.rs` — `process_admin_withdraw_insurance`  
**Severity:** INFO  
**Status:** ⚠️ INFORMATIONAL

`total_returned` is incremented on every successful `AdminWithdrawInsurance` call,
but is never compared against `total_flushed`.  If `total_returned > total_flushed`,
`total_pool_value()` reports a value higher than what was ever in the vault
accounting, inflating LP token redemption values.

In practice this scenario requires multiple successful wrapper-level insurance
withdrawals totaling more than was ever flushed, which the wrapper's own
accounting (tracking the insurance balance) would prevent.  The actual vault
balance remains the hard floor — SPL token transfers will fail before any double-
spend occurs.

**Recommendation:** Add a soft assertion `total_returned <= total_flushed` as a
debug/sanity guard.

---

#### N8 · `process_init_pool` Does Not Validate `lp_mint` / `vault` Are Uninitialized Token Accounts (INFO)

**File:** `processor.rs` — `process_init_pool`  
**Severity:** INFO  
**Status:** ⚠️ INFORMATIONAL

`lp_mint` and `vault` are passed as arbitrary addresses by the admin.  The program
calls `initialize_mint` and `initialize_account` on them.  If these accounts
are already initialized (e.g., if the admin re-uses an existing mint address),
SPL Token instructions will reject the operation.  There is no stake-program-level
check that these accounts are actually blank before spending rent on them.

This is consistent with how other Solana programs handle initialization; the SPL
Token program is the authoritative guard.  No security impact.

---

## CPI Tag Consistency Check

The following table verifies alignment between `percolator-stake/src/cpi.rs` and
`percolator-launch/program/src/tags.rs`:

| Stake constant | Value | Launch constant | Value | Match? |
|----------------|-------|-----------------|-------|--------|
| `TAG_TOP_UP_INSURANCE` | 9 | `TAG_TOP_UP_INSURANCE` | 9 | ✅ |
| `TAG_SET_RISK_THRESHOLD` | 11 | `TAG_SET_RISK_THRESHOLD` | 11 | ✅ |
| `TAG_UPDATE_ADMIN` | 12 | `TAG_UPDATE_ADMIN` | 12 | ✅ |
| `TAG_SET_MAINTENANCE_FEE` | 15 | `TAG_SET_MAINTENANCE_FEE` | 15 | ✅ |
| `TAG_SET_ORACLE_AUTHORITY` | 16 | `TAG_SET_ORACLE_AUTHORITY` | 16 | ✅ |
| `TAG_SET_ORACLE_PRICE_CAP` | 18 | `TAG_SET_ORACLE_PRICE_CAP` | 18 | ✅ |
| `TAG_RESOLVE_MARKET` | 19 | `TAG_RESOLVE_MARKET` | 19 | ✅ |
| `TAG_WITHDRAW_INSURANCE` | 20 | `TAG_WITHDRAW_INSURANCE` | 20 | ✅ |
| `TAG_SET_INSURANCE_WITHDRAW_POLICY` | **30** | `TAG_SET_INSURANCE_WITHDRAW_POLICY` | **30** | ✅ |
| `TAG_WITHDRAW_INSURANCE_LIMITED` | **31** | `TAG_WITHDRAW_INSURANCE_LIMITED` | **31** | ✅ |

All CPI tags are correctly aligned after the C0 fix.  The previously dangerous
values (22/23 colliding with `UpdateRiskParams`/`RenounceAdmin`) are gone.

---

## Formal Verification Status

### Kani Proofs (33 harnesses, all pass)

| Category | Count | Properties verified |
|----------|-------|---------------------|
| Conservation | 5 | Deposit→withdraw roundtrip, first-depositor, two-depositor, no-dilution, flush-preserves-value |
| Arithmetic Safety | 4 | Full u32 range, no panics |
| Fairness/Monotonicity | 3 | Determinism, deposit-monotone, burn-monotone |
| Withdrawal Bounds | 2 | Full burn ≤ pool value, partial ≤ full |
| Flush Bounds | 2 | Bounded, max-then-zero |
| Pool Value | 3 | Correctness, deposit-increases, returns-increase |
| Zero Boundaries | 2 | Zero-in → zero-out |
| Cooldown Enforcement | 3 | No panic, not-immediate, exact-boundary |
| Deposit Cap | 3 | Uncapped, at-boundary, above-boundary |
| **C9 Orphaned Value** | **3** | Orphaned-blocked, valueless-LP-blocked, true-first-depositor-OK |
| Extended Safety | 2 | pool_value_with_returns, exceeds_cap_no_panic |

**Note:** Proofs use u32 inputs for SAT-solver tractability.  Production uses u64.
The u128 intermediate arithmetic provides the necessary headroom.

### Unit Tests (141 tests, all pass)

- `math.rs`: LP calculation, pool value, flush, rounding, conservation, C9 scenarios
- `instruction.rs`: All 12 instruction tags, boundary values, error cases
- `state.rs`: Struct sizes, PDA derivation, pool value, LP math delegation
- `proptest_math.rs`: 17 property-based tests across production-scale u64 ranges
- `struct_layout.rs`, `unit.rs`, `cpi_tags.rs`, `error_codes.rs`

---

## Complete Finding Register

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| C0 | CRITICAL | CPI tag mismatch (22/23 → 30/31) | ✅ FIXED |
| C1 | CRITICAL | `saturating_sub` on LP supply | ✅ FIXED |
| C2 | CRITICAL | `saturating_sub` on deposit LP amount | ✅ FIXED |
| C3 | CRITICAL | `total_returned` never updated | ✅ FIXED |
| C4 | CRITICAL | `pool_value` missing `total_returned` | ✅ FIXED (then corrected in C8) |
| C5 | CRITICAL | Missing `percolator_program` validation | ✅ FIXED |
| C6 | CRITICAL | Missing `verify_token_program` in deposit | ✅ FIXED |
| C7 | CRITICAL | Missing `verify_token_program` in withdraw | ✅ FIXED |
| C8 | CRITICAL | `pool_value` formula missing `−flushed` | ✅ FIXED |
| C9 | CRITICAL | First-depositor `||` bug — orphaned insurance theft | ✅ FIXED | <!-- markdownlint-disable-line MD056 -->
| C10 | CRITICAL | `FlushToInsurance` permissionless DoS | ✅ FIXED |
| H1 | HIGH | No `admin_transferred` check in deposit | ✅ FIXED |
| H2 | HIGH | Permissionless flush (promoted → C10) | ✅ FIXED |
| H3 | HIGH | CPI signer flag: `slab` | ✅ FIXED |
| H4 | HIGH | CPI signer flags: vaults | ✅ FIXED |
| H5 | HIGH | Trailing bytes ignored in deserialization | ⚠️ ACCEPTED |
| H6 | HIGH | Deposit cap uses lifetime `total_deposited` | ✅ FIXED |
| M1 | MEDIUM | Duplicate Kani proof locations | ✅ FIXED |
| M2 | MEDIUM | No struct versioning | ✅ FIXED |
| M3 | MEDIUM | Missing `deposit.pool` check in withdraw | ✅ FIXED |
| M4 | MEDIUM | No reentrancy guard | ⚠️ ACCEPTED |
| M5 | MEDIUM | Missing vault check in withdraw | ✅ FIXED |
| M6 | MEDIUM | Missing vault check in flush | ✅ FIXED |
| M7 | MEDIUM | `TransferAdmin` missing pool admin check | ✅ FIXED |
| L1 | LOW | Collateral mint not validated against slab | ⚠️ DOCUMENTED |
| L2 | LOW | No structured event emission | ⚠️ ACCEPTED |
| L3 | LOW | No independent vault ownership check in CPI | ⚠️ ACCEPTED |
| L4 | LOW | `saturating_sub` in `flush_available` | ✅ FIXED |
| N1 | INFO | Dead code: `cpi_withdraw_insurance` (Tag 20) | ⚠️ RECOMMEND CLEANUP |
| N2 | LOW | Stale tag numbers in CPI section-header comments | ⚠️ RECOMMEND FIX |
| N3 | INFO | Runtime `find_program_address` wastes compute budget | ⚠️ INFORMATIONAL |
| N4 | LOW | Missing `verify_token_program` in flush | ⚠️ RECOMMEND FIX |
| N5 | LOW | `AdminWithdrawInsurance` does not validate `stake_vault == pool.vault` | ⚠️ RECOMMEND FIX |
| N6 | INFO | LP mint decimals hardcoded to 6 | ⚠️ INFORMATIONAL |
| N7 | INFO | `total_returned` not bounded by `total_flushed` | ⚠️ INFORMATIONAL |
| N8 | INFO | `InitPool` does not pre-check `lp_mint`/`vault` are uninitialized | ⚠️ INFORMATIONAL |

**Totals:** 11 CRITICAL (all fixed) · 6 HIGH (5 fixed, 1 accepted) · 7 MEDIUM (5 fixed, 2 accepted) · 4 LOW (1 fixed, 3 documented/accepted) · 8 NEW (3 recommend fix, 5 informational)

---

## Prioritized Recommendations

### P1 — Fix stale tag comments in `cpi.rs` (N2) — 5 min effort, eliminates confusion

Update the section-header comments for `cpi_set_insurance_withdraw_policy` and
`cpi_withdraw_insurance_limited` from "Tag 21/22" to "Tag 30/31".

### P2 — Add `verify_token_program` to `process_flush_to_insurance` (N4) — 2 min effort

Consistent with C6/C7 fixes.  Add before `cpi_top_up_insurance` call:
```rust
verify_token_program(token_program)?;
```

### P3 — Validate `stake_vault == pool.vault` in `AdminWithdrawInsurance` (N5) — 5 min effort

```rust
if pool.vault != stake_vault.key.to_bytes() {
    return Err(StakeError::InvalidPda.into());
}
```

### P4 — Use stored vault_auth bump instead of `find_program_address` (N3) — 20 min effort

Replace:
```rust
let (expected_vault_auth, vault_auth_bump) = Pubkey::find_program_address(
    &[b"vault_auth", pool_pda.key.as_ref()], program_id,
);
```
With:
```rust
let vault_auth_bump = pool.vault_authority_bump;
let expected_vault_auth = Pubkey::create_program_address(
    &[b"vault_auth", pool_pda.key.as_ref(), &[vault_auth_bump]],
    program_id,
)?;
```
Apply consistently in all four processor functions that derive `vault_auth`.

### P5 — Remove or document dead `cpi_withdraw_insurance` (N1) — 5 min effort

Either remove the function or add a prominent comment explaining why it is
retained (e.g., "retained for backward-compat CPI from external callers that
use the older single-step admin withdraw path").

---

## Security Summary

The percolator-stake program has undergone rigorous iterative auditing.  The
original codebase contained **11 critical vulnerabilities** that could have led
to complete fund loss:

- Silent underflow (saturating arithmetic) allowing LP supply manipulation
- Missing token-program identity checks enabling vault drain via fake programs
- Incorrect CPI tag numbers that would call `RenounceAdmin` during insurance withdrawal
- Permissionless vault flush enabling indefinite lockout of all user funds
- First-depositor OR-condition enabling theft of all returned insurance

All 11 critical findings, and the majority of high/medium findings, are fixed in
the current HEAD (`878c7b0`).  The remaining open items are low-severity or
informational.

The formal verification suite (33 Kani proofs + 141 unit tests) provides strong
confidence in the LP math, overflow safety, and cooldown enforcement.

**The program is considered suitable for testnet deployment.**  Mainnet deployment
should be preceded by fixing P1–P3 above and conducting an independent professional
audit of the full state machine.
