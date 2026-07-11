import { describe, expect, it } from 'vitest';
import { floatFromSeeds, sexcoinFlip } from '../../provably-fair/provably-fair.crypto';
import {
  CoinSide,
  flipResult,
  MAX_STREAK,
  multiplierFor,
  multiplierLadder,
  normalizeGuess,
  replay,
  SeedTuple,
} from './sexcoin.engine';

const seeds = (nonce: number): SeedTuple => ({
  serverSeed: 'a'.repeat(64),
  clientSeed: 'b'.repeat(32),
  nonce,
});

/** The fair result of flip #i for a seed tuple — what replay must agree with. */
const resultAt = (s: SeedTuple, i: number): CoinSide =>
  sexcoinFlip(s.serverSeed, s.clientSeed, s.nonce, i);

/** A guess log of `n` all-correct flips (the player "reads" the fair results). */
const winningGuesses = (s: SeedTuple, n: number): CoinSide[] =>
  Array.from({ length: n }, (_, i) => resultAt(s, i));

const other = (side: CoinSide): CoinSide => (side === 'penis' ? 'vagina' : 'penis');

describe('multiplierFor follows mult(k) = round2(RTP × 2^k)', () => {
  it('hand-checked points at the default RTP 0.97', () => {
    expect(multiplierFor(1, 0.97)).toBe(1.94);
    expect(multiplierFor(2, 0.97)).toBe(3.88);
    expect(multiplierFor(3, 0.97)).toBe(7.76);
    // the cap step ≈ ×1,017,000 — the crash-style ×1M ceiling in spirit
    expect(multiplierFor(MAX_STREAK, 0.97)).toBe(1017118.72);
  });

  it('an RTP retune moves every step: ×1.80 per step at RTP 0.90', () => {
    expect(multiplierFor(1, 0.9)).toBe(1.8);
    expect(multiplierFor(2, 0.9)).toBe(3.6);
  });

  it('matches round2(rtp × 2^k) and is strictly monotonic for k = 1..MAX_STREAK', () => {
    for (const rtp of [0.9, 0.95, 0.97, 0.99]) {
      let prev = 0;
      for (let k = 1; k <= MAX_STREAK; k++) {
        const direct = Math.round(rtp * Math.pow(2, k) * 100) / 100;
        const m = multiplierFor(k, rtp);
        expect(m).toBe(direct);
        expect(m).toBeGreaterThan(prev);
        prev = m;
      }
    }
  });

  it('a garbage RTP falls back to 0.97 instead of exploding', () => {
    expect(multiplierFor(3, 0)).toBe(multiplierFor(3, 0.97));
    expect(multiplierFor(3, 5)).toBe(multiplierFor(3, 0.97));
    expect(multiplierFor(3, -1)).toBe(multiplierFor(3, 0.97));
  });

  it('the ladder lists mult at k = 1..MAX_STREAK and matches multiplierFor', () => {
    const ladder = multiplierLadder(0.97);
    expect(ladder).toHaveLength(MAX_STREAK);
    expect(ladder[0]).toBe(1.94);
    expect(ladder[MAX_STREAK - 1]).toBe(multiplierFor(MAX_STREAK, 0.97));
    ladder.forEach((m, i) => expect(m).toBe(multiplierFor(i + 1, 0.97)));
  });
});

describe('the edge is flat: 0.5^k × mult(k) ≈ RTP at every depth', () => {
  it('holds for k = 1..MAX_STREAK at several RTPs (up to the 2 dp rounding)', () => {
    for (const rtp of [0.9, 0.97, 0.99]) {
      for (let k = 1; k <= MAX_STREAK; k++) {
        // |round2 error| ≤ 0.005, scaled by 0.5^k — far inside the tolerance
        expect(Math.pow(0.5, k) * multiplierFor(k, rtp)).toBeCloseTo(rtp, 2);
      }
    }
  });
});

describe('flipResult / sexcoinFlip: determinism & distribution', () => {
  it('maps a float to a side at the 0.5 boundary', () => {
    expect(flipResult(0)).toBe('penis');
    expect(flipResult(0.4999)).toBe('penis');
    expect(flipResult(0.5)).toBe('vagina');
    expect(flipResult(0.9999)).toBe('vagina');
  });

  it('is deterministic: same seeds + nonce + cursor give the same side', () => {
    for (let n = 0; n < 30; n++) {
      for (let i = 0; i < 5; i++) {
        const s = seeds(n);
        expect(resultAt(s, i)).toBe(resultAt(s, i));
        expect(resultAt(s, i)).toBe(flipResult(floatFromSeeds(s.serverSeed, s.clientSeed, s.nonce, i)));
      }
    }
  });

  it('different cursors on one nonce are independent flips (both sides appear)', () => {
    const s = seeds(1);
    const sides = new Set(Array.from({ length: 32 }, (_, i) => resultAt(s, i)));
    expect(sides.size).toBe(2);
  });

  it('the coin is honest: a large sample of flips lands ≈ 50/50', () => {
    const N = 10_000;
    let penis = 0;
    for (let n = 0; n < N; n++) {
      if (resultAt(seeds(n), 0) === 'penis') penis++;
    }
    expect(penis / N).toBeGreaterThan(0.47);
    expect(penis / N).toBeLessThan(0.53);
  });
});

describe('normalizeGuess', () => {
  it('accepts the two coin sides only', () => {
    expect(normalizeGuess('penis')).toBe('penis');
    expect(normalizeGuess('vagina')).toBe('vagina');
    expect(() => normalizeGuess('heads')).toThrow('SEXCOIN_BAD_GUESS');
    expect(() => normalizeGuess('')).toThrow('SEXCOIN_BAD_GUESS');
    expect(() => normalizeGuess(0)).toThrow('SEXCOIN_BAD_GUESS');
    expect(() => normalizeGuess(undefined)).toThrow('SEXCOIN_BAD_GUESS');
  });
});

describe('replay: determinism & rules', () => {
  it('is a pure function of seeds + guesses; results mirror the seed chain', () => {
    for (let n = 0; n < 30; n++) {
      const s = seeds(n);
      const guesses = winningGuesses(s, 4);
      const a = replay(s, guesses);
      const b = replay(s, guesses);
      expect(b).toEqual(a);
      expect(a.streak).toBe(4);
      expect(a.busted).toBe(false);
      expect(a.results).toEqual(guesses); // all-correct log: results == guesses
    }
  });

  it('a miss busts the series and stops it', () => {
    for (let n = 0; n < 30; n++) {
      const s = seeds(n);
      const good = winningGuesses(s, 3);
      const missAt2 = [good[0], good[1], other(resultAt(s, 2))];
      const state = replay(s, missAt2);
      expect(state.busted).toBe(true);
      expect(state.streak).toBe(2);
      expect(state.results).toHaveLength(3);
      // playing on after the miss is illegal — a tampered log throws
      expect(() => replay(s, [...missAt2, good[0]])).toThrow('SEXCOIN_ROUND_OVER');
    }
  });

  it('an instant miss burns the stake with streak 0', () => {
    const s = seeds(7);
    const state = replay(s, [other(resultAt(s, 0))]);
    expect(state.busted).toBe(true);
    expect(state.streak).toBe(0);
  });

  it('throws on a bad side inside the log', () => {
    expect(() => replay(seeds(1), ['heads' as CoinSide])).toThrow('SEXCOIN_BAD_GUESS');
  });

  it('the cap: MAX_STREAK correct flips end the series (forced auto-collect)', () => {
    const s = seeds(5);
    const full = winningGuesses(s, MAX_STREAK);
    const state = replay(s, full);
    expect(state.streak).toBe(MAX_STREAK);
    expect(state.busted).toBe(false);
    // the service settles WON here; one more guess can never reach the money
    expect(() => replay(s, [...full, resultAt(s, MAX_STREAK)])).toThrow('SEXCOIN_ROUND_OVER');
  });
});
