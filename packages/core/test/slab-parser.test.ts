import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  parseHeader, parseConfig, parseEngine, parseAllAccounts, parseParams,
  parseAccount, maxAccountIndex,
} from "../src/solana/slab.js";

/** Build a minimal valid slab buffer for header + config + engine (no accounts). */
function buildMockSlab(): Uint8Array {
  const size = 992_560;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);

  // Header: PERCOLAT magic as u64 LE (0x504552434f4c4154 stored little-endian)
  const magic = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
  for (let i = 0; i < 8; i++) buf[i] = magic[i];
  // version = 1
  dv.setUint32(8, 1, true);
  // bump = 255
  buf[12] = 255;
  // admin (32 bytes of 1s at offset 16)
  for (let i = 16; i < 48; i++) buf[i] = 1;

  // Config at offset 72
  // collateralMint (32 bytes of 2s)
  for (let i = 72; i < 104; i++) buf[i] = 2;
  // vaultPubkey (32 bytes of 3s)
  for (let i = 104; i < 136; i++) buf[i] = 3;

  // Engine at offset 392
  const engineBase = 392;
  // vault = 1000000 (U128)
  dv.setBigUint64(engineBase + 0, 1000000n, true);
  // insurance balance = 500000
  dv.setBigUint64(engineBase + 16, 500000n, true);
  // totalOpenInterest = 100000
  dv.setBigUint64(engineBase + 248, 100000n, true);
  // cTot = 800000
  dv.setBigUint64(engineBase + 264, 800000n, true);
  // numUsedAccounts = 0
  dv.setUint16(engineBase + 920, 0, true);
  // nextAccountId = 1
  dv.setBigUint64(engineBase + 928, 1n, true);

  // RiskParams at engine offset 48
  const paramsBase = engineBase + 48;
  dv.setBigUint64(paramsBase + 8, 500n, true);  // maintenanceMarginBps
  dv.setBigUint64(paramsBase + 16, 1000n, true); // initialMarginBps
  dv.setBigUint64(paramsBase + 24, 10n, true);   // tradingFeeBps

  return buf;
}

describe("parseHeader", () => {
  it("parses valid header", () => {
    const buf = buildMockSlab();
    const h = parseHeader(buf);
    expect(h.magic).toBe(0x504552434f4c4154n);
    expect(h.version).toBe(1);
    expect(h.bump).toBe(255);
    expect(h.resolved).toBe(false);
  });

  it("throws on invalid magic", () => {
    const buf = new Uint8Array(992_560);
    expect(() => parseHeader(buf)).toThrow("Invalid slab magic");
  });

  it("throws on too-short data", () => {
    expect(() => parseHeader(new Uint8Array(10))).toThrow("too short");
  });
});

describe("parseConfig", () => {
  it("parses valid config", () => {
    const buf = buildMockSlab();
    const c = parseConfig(buf);
    // collateralMint should be 32 bytes of 2s
    expect(c.collateralMint.toBytes()[0]).toBe(2);
    expect(c.vaultPubkey.toBytes()[0]).toBe(3);
  });
});

describe("parseEngine", () => {
  it("parses engine state", () => {
    const buf = buildMockSlab();
    const e = parseEngine(buf);
    expect(e.vault).toBe(1000000n);
    expect(e.insuranceFund.balance).toBe(500000n);
    expect(e.totalOpenInterest).toBe(100000n);
    expect(e.cTot).toBe(800000n);
    expect(e.numUsedAccounts).toBe(0);
    expect(e.nextAccountId).toBe(1n);
  });
});

describe("parseParams", () => {
  it("parses risk params", () => {
    const buf = buildMockSlab();
    const p = parseParams(buf);
    expect(p.maintenanceMarginBps).toBe(500n);
    expect(p.initialMarginBps).toBe(1000n);
    expect(p.tradingFeeBps).toBe(10n);
  });
});

describe("parseAllAccounts", () => {
  it("returns empty for no used accounts", () => {
    const buf = buildMockSlab();
    const accounts = parseAllAccounts(buf);
    expect(accounts).toEqual([]);
  });
});

describe("maxAccountIndex integer safety", () => {
  it("returns 0 for NaN dataLen", () => {
    expect(maxAccountIndex(NaN)).toBe(0);
  });

  it("returns 0 for Infinity dataLen", () => {
    expect(maxAccountIndex(Infinity)).toBe(0);
  });

  it("returns 0 for negative dataLen", () => {
    expect(maxAccountIndex(-1)).toBe(0);
  });

  it("returns 0 for float dataLen (large)", () => {
    expect(maxAccountIndex(992560.5)).toBe(0);
  });

  it("returns 0 for float dataLen (small)", () => {
    expect(maxAccountIndex(10.5)).toBe(0);
  });

  it("returns a positive count for valid dataLen", () => {
    expect(maxAccountIndex(992_560)).toBeGreaterThan(0);
  });
});

describe("parseAccount index guard", () => {
  it("throws on NaN index (would bypass numeric comparison)", () => {
    const buf = buildMockSlab();
    expect(() => parseAccount(buf, NaN)).toThrow("out of range");
  });

  it("throws on float index (misaligned offset)", () => {
    const buf = buildMockSlab();
    expect(() => parseAccount(buf, 0.5)).toThrow("out of range");
  });

  it("throws on negative index", () => {
    const buf = buildMockSlab();
    expect(() => parseAccount(buf, -1)).toThrow("out of range");
  });

  it("throws on out-of-bounds integer index", () => {
    const buf = buildMockSlab();
    const max = maxAccountIndex(buf.length);
    expect(() => parseAccount(buf, max)).toThrow("out of range");
  });

  it("throws on out-of-bounds large index", () => {
    const buf = buildMockSlab();
    expect(() => parseAccount(buf, 999999)).toThrow("out of range");
  });
});
