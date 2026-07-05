import { describe, expect, it } from 'vitest';
import { genClientSeed, genServerSeed } from '../../provably-fair/provably-fair.crypto';
import {
  baseTable,
  binomial,
  multipliers,
  normalizeConfig,
  PLINKO_MAX_ROWS,
  PLINKO_MIN_ROWS,
  PLINKO_RISKS,
  plinkoPath,
  settle,
  slotOf,
  slotProbability,
} from './plinko.engine';

const ROWS = Array.from({ length: PLINKO_MAX_ROWS - PLINKO_MIN_ROWS + 1 }, (_, i) => PLINKO_MIN_ROWS + i);

describe('multiplier tables', () => {
  it('every risk × rows table is symmetric, well-sized and centre-minimal', () => {
    for (const risk of PLINKO_RISKS) {
      for (const rows of ROWS) {
        const table = baseTable(risk, rows);
        expect(table).toHaveLength(rows + 1);
        // symmetric — the board is mirror-image, edges pay the same both sides
        for (let k = 0; k <= rows; k++) expect(table[k]).toBeCloseTo(table[rows - k], 10);
        // the biggest multipliers are the edges, the smallest is the centre
        const centre = table[Math.floor(rows / 2)];
        expect(table[0]).toBe(Math.max(...table));
        expect(centre).toBe(Math.min(...table));
        expect(table[0]).toBeGreaterThan(centre);
      }
    }
  });

  it('higher risk means a higher top multiplier for the same rows', () => {
    for (const rows of ROWS) {
      const low = baseTable('LOW', rows)[0];
      const med = baseTable('MEDIUM', rows)[0];
      const high = baseTable('HIGH', rows)[0];
      expect(med).toBeGreaterThan(low);
      expect(high).toBeGreaterThan(med);
    }
  });
});

describe('binomial slot distribution', () => {
  it('C(n,k) matches a known row and slot probabilities sum to 1', () => {
    expect(binomial(16, 0)).toBe(1);
    expect(binomial(16, 8)).toBe(12870);
    expect(binomial(8, 4)).toBe(70);
    for (const rows of ROWS) {
      let sum = 0;
      for (let k = 0; k <= rows; k++) sum += slotProbability(rows, k);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});

describe('provably-fair path', () => {
  it('is deterministic and lands in a valid slot for every config', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    for (const rows of ROWS) {
      for (let n = 0; n < 200; n++) {
        const path = plinkoPath(s, c, n, rows);
        expect(path).toHaveLength(rows);
        expect(plinkoPath(s, c, n, rows)).toEqual(path); // deterministic
        const slot = slotOf(path);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThanOrEqual(rows);
      }
    }
  });

  it('empirical landing distribution tracks the binomial', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const rows = 8;
    const N = 120_000;
    const counts = new Array(rows + 1).fill(0);
    for (let n = 0; n < N; n++) counts[slotOf(plinkoPath(s, c, n, rows))]++;
    for (let k = 0; k <= rows; k++) {
      expect(counts[k] / N).toBeCloseTo(slotProbability(rows, k), 1);
    }
  });
});

describe('RTP is exactly configurable (only the payout table carries the edge)', () => {
  it('the expected drop return equals the configured RTP for every config', () => {
    for (const risk of PLINKO_RISKS) {
      for (const rows of ROWS) {
        for (const rtp of [0.9, 0.97, 0.99, 1]) {
          const table = multipliers(risk, rows, rtp);
          let ev = 0;
          for (let k = 0; k <= rows; k++) ev += slotProbability(rows, k) * table[k];
          expect(ev).toBeCloseTo(rtp, 3);
        }
      }
    }
  });

  it('an admin RTP retune scales payouts proportionally', () => {
    const a = multipliers('MEDIUM', 12, 0.99);
    const b = multipliers('MEDIUM', 12, 0.9);
    // Both tables are independently rounded to 4 dp, so compare the ratio at a
    // sane tolerance rather than bit-for-bit.
    for (let k = 0; k < a.length; k++) expect(b[k]).toBeCloseTo(a[k] * (0.9 / 0.99), 2);
  });

  it('garbage RTP falls back instead of exploding', () => {
    const good = multipliers('LOW', 10, 0.99);
    expect(multipliers('LOW', 10, 0)).toEqual(good);
    expect(multipliers('LOW', 10, 5)).toEqual(good);
  });

  it('empirical RTP over real provably-fair drops matches the configured RTP', () => {
    const s = genServerSeed();
    const c = genClientSeed();
    const risk = 'HIGH';
    const rows = 16;
    const rtp = 0.97;
    const table = multipliers(risk, rows, rtp);
    let staked = 0;
    let returned = 0;
    for (let n = 0; n < 300_000; n++) {
      const slot = slotOf(plinkoPath(s, c, n, rows));
      staked += 1;
      returned += table[slot];
    }
    expect(returned / staked).toBeGreaterThan(rtp - 0.04);
    expect(returned / staked).toBeLessThan(rtp + 0.04);
  });
});

describe('settle', () => {
  it('pays stake × the landing slot multiplier', () => {
    const { slot, multiplier, payout } = settle('LOW', 8, 4, 10, 0.99);
    expect(slot).toBe(4);
    expect(multiplier).toBe(multipliers('LOW', 8, 0.99)[4]);
    expect(payout).toBeCloseTo(10 * multiplier, 10);
  });

  it('clamps an out-of-range slot into the table', () => {
    expect(() => settle('LOW', 8, 99, 10, 0.99)).not.toThrow();
    expect(settle('LOW', 8, 99, 10, 0.99).multiplier).toBe(multipliers('LOW', 8, 0.99)[8]);
  });
});

describe('config validation', () => {
  it('accepts supported risks/rows and rejects the rest', () => {
    expect(normalizeConfig('low', 8)).toEqual({ risk: 'LOW', rows: 8 });
    expect(normalizeConfig('HIGH', 16)).toEqual({ risk: 'HIGH', rows: 16 });
    expect(() => normalizeConfig('EXTREME', 8)).toThrow();
    expect(() => normalizeConfig('LOW', 7)).toThrow();
    expect(() => normalizeConfig('LOW', 17)).toThrow();
    expect(() => normalizeConfig('LOW', 8.5)).toThrow();
  });
});
