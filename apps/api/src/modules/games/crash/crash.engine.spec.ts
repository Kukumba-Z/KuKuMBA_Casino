import { describe, expect, it } from 'vitest';
import {
  crashResult,
  floatFromSeeds,
  genClientSeed,
  genServerSeed,
} from '../../provably-fair/provably-fair.crypto';
import {
  autoCashoutWins,
  CRASH_MAX_MULT,
  crashPointFor,
  floorMult,
  multiplierAt,
  secondsToReach,
} from './crash.engine';

describe('crash payout math', () => {
  it('crash point is deterministic and inside [1, 1e6]', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    for (let n = 0; n < 1000; n++) {
      const cp = crashResult(s, c, n);
      expect(cp).toBeGreaterThanOrEqual(1);
      expect(cp).toBeLessThanOrEqual(CRASH_MAX_MULT);
      expect(crashResult(s, c, n)).toBe(cp);
      // floored to 2 decimals — what players see is what settles
      expect(floorMult(cp)).toBe(cp);
    }
  });

  it('returns ~RTP for ANY auto-cashout target (flat edge, like roulette)', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const RTP = 0.99;
    for (const target of [1.2, 1.5, 2, 5, 20]) {
      let staked = 0;
      let returned = 0;
      for (let n = 0; n < 150_000; n++) {
        const cp = crashPointFor(floatFromSeeds(s, c, n), RTP);
        staked += 1;
        if (autoCashoutWins(target, cp)) returned += target;
      }
      const empirical = returned / staked;
      expect(empirical).toBeGreaterThan(0.94);
      expect(empirical).toBeLessThan(1.04);
    }
  });

  it('follows a configured RTP (admin retune flows straight into payouts)', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    for (const rtp of [0.9, 0.97]) {
      let returned = 0;
      const N = 200_000;
      const target = 2;
      for (let n = 0; n < N; n++) {
        if (autoCashoutWins(target, crashPointFor(floatFromSeeds(s, c, n), rtp))) returned += target;
      }
      expect(returned / N).toBeGreaterThan(rtp - 0.03);
      expect(returned / N).toBeLessThan(rtp + 0.03);
    }
  });

  it('instant-crash share matches theory: P(crash < 2) = 1 − RTP/2', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const N = 100_000;
    let under2 = 0;
    for (let n = 0; n < N; n++) if (crashResult(s, c, n) < 2) under2++;
    expect(under2 / N).toBeGreaterThan(0.49);
    expect(under2 / N).toBeLessThan(0.52);
  });
});

describe('deterministic multiplier curve (server-authoritative cashouts)', () => {
  it('multiplierAt is the exact inverse of secondsToReach', () => {
    for (const m of [1.01, 1.5, 2, 10, 100, 5000, CRASH_MAX_MULT]) {
      expect(multiplierAt(secondsToReach(m))).toBeCloseTo(m, 6);
    }
  });

  it('starts at 1× and grows monotonically', () => {
    expect(multiplierAt(0)).toBe(1);
    expect(multiplierAt(-5)).toBe(1);
    let prev = 1;
    for (let t = 0.5; t < 60; t += 0.5) {
      const m = multiplierAt(t);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it('has sane pacing: ~2× in a few seconds, the 1M cap in ~2 minutes', () => {
    expect(secondsToReach(2)).toBeGreaterThan(1.5);
    expect(secondsToReach(2)).toBeLessThan(5);
    expect(secondsToReach(CRASH_MAX_MULT)).toBeGreaterThan(60);
    expect(secondsToReach(CRASH_MAX_MULT)).toBeLessThan(300);
  });

  it('caps at the jackpot multiplier', () => {
    expect(multiplierAt(10_000)).toBe(CRASH_MAX_MULT);
  });
});
