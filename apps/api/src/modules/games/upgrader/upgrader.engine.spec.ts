import { describe, expect, it } from 'vitest';
import { floatFromSeeds, genClientSeed, genServerSeed } from '../../provably-fair/provably-fair.crypto';
import {
  multiplierFor,
  normalizeChance,
  settle,
  UPGRADER_MAX_CHANCE,
  UPGRADER_MIN_CHANCE,
} from './upgrader.engine';

const RTP = 0.99;

describe('upgrader payout math', () => {
  it('multiplier = RTP / chance (a few known points)', () => {
    expect(multiplierFor(0.5, RTP)).toBeCloseTo(1.98, 10); // 50% → ×1.98
    expect(multiplierFor(0.1, RTP)).toBeCloseTo(9.9, 10); // 10% → ×9.9
    expect(multiplierFor(0.01, RTP)).toBeCloseTo(99, 10); // 1%  → ×99
    expect(multiplierFor(0.99, RTP)).toBeCloseTo(1, 10); // 99% → ×1.00
  });

  it('house edge is flat: chance × multiplier ≈ RTP on ANY chance', () => {
    for (const chance of [UPGRADER_MIN_CHANCE, 0.05, 0.5, 0.99]) {
      expect(chance * multiplierFor(chance, RTP)).toBeCloseTo(RTP, 9);
    }
  });

  it('an admin RTP retune scales the multiplier proportionally', () => {
    expect(multiplierFor(0.5, 0.9)).toBeCloseTo(1.8, 10);
    expect(multiplierFor(0.5, 0.9)).toBeLessThan(multiplierFor(0.5, 0.99));
  });

  it('a garbage RTP falls back to 0.99 instead of exploding', () => {
    expect(multiplierFor(0.5, 0)).toBe(multiplierFor(0.5, 0.99));
    expect(multiplierFor(0.5, 5)).toBe(multiplierFor(0.5, 0.99));
    expect(multiplierFor(0.5, -1)).toBe(multiplierFor(0.5, 0.99));
  });
});

describe('settle', () => {
  it('float < chance wins and pays stake × multiplier', () => {
    const r = settle(0.5, 0.25, 10, RTP);
    expect(r.win).toBe(true);
    expect(r.payout).toBeCloseTo(10 * multiplierFor(0.5, RTP), 10);
    expect(r.angleBp).toBe(2500);
  });

  it('float ≥ chance loses and pays 0 (multiplier unchanged)', () => {
    const r = settle(0.5, 0.75, 10, RTP);
    expect(r.win).toBe(false);
    expect(r.payout).toBe(0);
    expect(r.multiplier).toBeCloseTo(multiplierFor(0.5, RTP), 10);
    expect(r.angleBp).toBe(7500);
  });

  it('the win-zone is half-open: float === chance is a LOSS', () => {
    const r = settle(0.5, 0.5, 10, RTP);
    expect(r.win).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('an out-of-range float is treated as 0 (a win at any positive chance)', () => {
    expect(settle(0.5, 1, 10, RTP).win).toBe(true); // float clamped to 0
    expect(settle(0.5, -0.1, 10, RTP).win).toBe(true);
    expect(settle(0.5, NaN, 10, RTP).angleBp).toBe(0);
  });

  it('empirical RTP over real provably-fair spins matches the configured RTP', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const chance = 0.2;
    const N = 200_000;
    let staked = 0;
    let returned = 0;
    for (let n = 0; n < N; n++) {
      const f = floatFromSeeds(s, c, n);
      staked += 1;
      returned += settle(chance, f, 1, RTP).payout;
    }
    expect(returned / staked).toBeGreaterThan(RTP - 0.03);
    expect(returned / staked).toBeLessThan(RTP + 0.03);
  });
});

describe('normalizeChance', () => {
  it('accepts values inside the range', () => {
    expect(normalizeChance(UPGRADER_MIN_CHANCE)).toBe(UPGRADER_MIN_CHANCE);
    expect(normalizeChance(0.5)).toBe(0.5);
    expect(normalizeChance(UPGRADER_MAX_CHANCE)).toBe(UPGRADER_MAX_CHANCE);
  });

  it('rejects out-of-range and non-finite values', () => {
    expect(() => normalizeChance(0)).toThrow();
    expect(() => normalizeChance(1)).toThrow();
    expect(() => normalizeChance(-1)).toThrow();
    expect(() => normalizeChance(NaN)).toThrow();
    expect(() => normalizeChance('abc')).toThrow();
    expect(() => normalizeChance(UPGRADER_MIN_CHANCE / 2)).toThrow();
    expect(() => normalizeChance(UPGRADER_MAX_CHANCE + 0.001)).toThrow();
  });
});
