import { describe, expect, it } from 'vitest';
import {
  floatFromSeeds,
  genClientSeed,
  genServerSeed,
  hashServerSeed,
  rouletteResult,
} from '../../provably-fair/provably-fair.crypto';
import { BET_TYPES, BETS, colorOf, POCKETS } from './roulette.constants';
import { isWin, multiplierFor, settleBet } from './roulette.engine';

const RTP = 0.99;

describe('roulette payout math', () => {
  it('every bet type returns EXACTLY the configured RTP in expectation', () => {
    for (const type of BET_TYPES) {
      const probability = BETS[type].winningCount / POCKETS;
      const expectedReturn = probability * multiplierFor(type, RTP);
      expect(expectedReturn).toBeCloseTo(RTP, 12); // house edge is a flat 1%
    }
  });

  it('derives the expected multipliers', () => {
    expect(multiplierFor('STRAIGHT', RTP)).toBeCloseTo(36.63, 2);
    expect(multiplierFor('RED', RTP)).toBeCloseTo(2.035, 3);
    expect(multiplierFor('DOZEN_1', RTP)).toBeCloseTo(3.0525, 3);
  });

  it('knows pocket colors', () => {
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
    expect(colorOf(36)).toBe('red');
  });

  it('settles bets correctly', () => {
    expect(isWin('RED', undefined, 1)).toBe(true);
    expect(isWin('BLACK', undefined, 1)).toBe(false);
    expect(isWin('STRAIGHT', { number: 7 }, 7)).toBe(true);
    expect(isWin('EVEN', undefined, 0)).toBe(false); // zero is not even here
    expect(settleBet('RED', undefined, 10, 1, RTP).payout).toBeCloseTo(20.33, 1);
    expect(settleBet('RED', undefined, 10, 2, RTP).payout).toBe(0);
  });
});

describe('provably-fair RNG', () => {
  it('is deterministic for the same seed chain', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    expect(rouletteResult(s, c, 5)).toBe(rouletteResult(s, c, 5));
  });

  it('produces floats in [0,1) and pockets in 0..36', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    for (let n = 0; n < 1000; n++) {
      const f = floatFromSeeds(s, c, n);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const o = rouletteResult(s, c, n);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(36);
    }
  });

  it('hashes the server seed deterministically', () => {
    expect(hashServerSeed('abc')).toBe(hashServerSeed('abc'));
    expect(hashServerSeed('abc')).toHaveLength(64);
  });

  it('draws pockets ~uniformly (all 37 appear, mean ≈ 18)', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const N = 37000;
    const counts = new Array(37).fill(0);
    let sum = 0;
    for (let n = 0; n < N; n++) {
      const o = rouletteResult(s, c, n);
      counts[o]++;
      sum += o;
    }
    expect(counts.every((x) => x > 0)).toBe(true);
    expect(sum / N).toBeGreaterThan(16.5);
    expect(sum / N).toBeLessThan(19.5);
  });

  it('converges to 99% RTP over many spins (bet RED every round)', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const N = 150000;
    let staked = 0;
    let returned = 0;
    for (let n = 0; n < N; n++) {
      const o = rouletteResult(s, c, n);
      staked += 1;
      returned += settleBet('RED', undefined, 1, o, RTP).payout;
    }
    const empiricalRtp = returned / staked;
    expect(empiricalRtp).toBeGreaterThan(0.96);
    expect(empiricalRtp).toBeLessThan(1.02);
  });
});
