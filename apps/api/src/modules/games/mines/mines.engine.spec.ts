import { describe, expect, it } from 'vitest';
import {
  cashout,
  mineLayout,
  minePositions,
  MINES_GRID,
  MINES_MAX,
  MINES_MIN,
  multiplierFor,
  multiplierLadder,
  normalizeMines,
  replay,
  Seeds,
} from './mines.engine';

const seeds = (nonce: number): Seeds => ({
  serverSeed: 'a'.repeat(64),
  clientSeed: 'b'.repeat(32),
  nonce,
});

/** Exact binomial C(n, k) — the direct (factorial-free) reference for the tests. */
function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

describe('normalizeMines', () => {
  it('accepts integers 2..24', () => {
    expect(normalizeMines(MINES_MIN)).toBe(2);
    expect(normalizeMines(5)).toBe(5);
    expect(normalizeMines('10')).toBe(10);
    expect(normalizeMines(MINES_MAX)).toBe(24);
  });

  it('rejects out-of-range and non-integer values', () => {
    expect(() => normalizeMines(1)).toThrow();
    expect(() => normalizeMines(25)).toThrow();
    expect(() => normalizeMines(0)).toThrow();
    expect(() => normalizeMines(-3)).toThrow();
    expect(() => normalizeMines(2.5)).toThrow();
    expect(() => normalizeMines(NaN)).toThrow();
    expect(() => normalizeMines('abc')).toThrow();
    expect(() => normalizeMines(undefined)).toThrow();
  });
});

describe('mineLayout', () => {
  it('is deterministic: same seeds → same mines; exactly m mines, all in 0..24', () => {
    for (const m of [2, 5, 13, 24]) {
      for (let n = 0; n < 50; n++) {
        const a = mineLayout(seeds(n), m);
        const b = mineLayout(seeds(n), m);
        expect([...b].sort()).toEqual([...a].sort());
        expect(a.size).toBe(m);
        for (const t of a) {
          expect(Number.isInteger(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThan(MINES_GRID);
        }
      }
    }
  });

  it('minePositions returns the same layout sorted ascending', () => {
    const pos = minePositions(seeds(7), 5);
    expect(pos).toEqual([...mineLayout(seeds(7), 5)].sort((a, b) => a - b));
    expect(pos).toHaveLength(5);
  });

  it('is uniform: across many nonces every tile is mined with frequency ≈ m/25', () => {
    const m = 5;
    const N = 5000;
    const hits = new Array<number>(MINES_GRID).fill(0);
    for (let n = 0; n < N; n++) {
      for (const t of mineLayout(seeds(n), m)) hits[t]++;
    }
    const expected = m / MINES_GRID; // 0.2
    for (let t = 0; t < MINES_GRID; t++) {
      expect(hits[t] / N).toBeGreaterThan(expected - 0.03);
      expect(hits[t] / N).toBeLessThan(expected + 0.03);
    }
  });
});

describe('multiplier follows mult(m, k) = RTP × C(25,k) / C(25−m,k), no cap', () => {
  const RTP = 0.99;

  it('hand-checked points', () => {
    expect(multiplierFor(3, 1, RTP)).toBeCloseTo(RTP * (25 / 22), 10);
    expect(multiplierFor(2, 1, RTP)).toBeCloseTo(RTP * (25 / 23), 10);
    expect(multiplierFor(24, 1, RTP)).toBeCloseTo(RTP * 25, 10); // one safe tile on 24 mines
    expect(multiplierFor(5, 0, RTP)).toBeCloseTo(RTP, 10); // k=0 → RTP < 1 (no cashout)
  });

  it('incremental product matches the direct binomial ratio', () => {
    for (const m of [2, 3, 5, 10, 13, 20, 24]) {
      for (let k = 0; k <= MINES_GRID - m; k++) {
        const direct = (0.99 * binom(MINES_GRID, k)) / binom(MINES_GRID - m, k);
        expect(multiplierFor(m, k, 0.99)).toBeCloseTo(direct, direct > 1e6 ? -2 : 6);
      }
    }
  });

  it('matches the industry anchors at RTP 0.97, m=13 (×48.04k → ×360.31k → ×5.04M)', () => {
    expect(multiplierFor(13, 10, 0.97)).toBeCloseTo(48_040.87, 0);
    expect(multiplierFor(13, 11, 0.97)).toBeCloseTo(360_306.5, 0);
    expect(multiplierFor(13, 12, 0.97)).toBeCloseTo(5_044_291, 0);
  });

  it('full clear at m=12/13 is C(25,12) × RTP ≈ ×5.15M at RTP 0.99 — uncapped', () => {
    expect(multiplierFor(13, 12, 0.99)).toBeCloseTo(5_148_297, 0);
    expect(multiplierFor(12, 13, 0.99)).toBeCloseTo(5_148_297, 0);
  });

  it('a garbage RTP falls back to 0.99 instead of exploding', () => {
    expect(multiplierFor(5, 3, 0)).toBe(multiplierFor(5, 3, 0.99));
    expect(multiplierFor(5, 3, 5)).toBe(multiplierFor(5, 3, 0.99));
    expect(multiplierFor(5, 3, -1)).toBe(multiplierFor(5, 3, 0.99));
  });

  it('the ladder lists mult at k = 1..25−m and matches multiplierFor', () => {
    const ladder = multiplierLadder(13, 0.97);
    expect(ladder).toHaveLength(12);
    expect(ladder[0]).toBeCloseTo(multiplierFor(13, 1, 0.97), 10);
    expect(ladder[11]).toBeCloseTo(5_044_291, 0);
  });

  it('the edge is flat: exact P(survive k) × mult(m, k) = RTP for any (m, k)', () => {
    for (const [m, k] of [
      [2, 1],
      [3, 5],
      [5, 10],
      [13, 12],
      [24, 1],
    ]) {
      const p = binom(MINES_GRID - m, k) / binom(MINES_GRID, k);
      expect(p * multiplierFor(m, k, 0.99)).toBeCloseTo(0.99, 6);
    }
  });

  it('the edge is flat empirically: survival over real layouts × mult ≈ RTP', () => {
    const m = 5;
    const k = 3;
    const picks = [0, 1, 2]; // any fixed k tiles — the layout is uniform
    const N = 20_000;
    let survived = 0;
    for (let n = 0; n < N; n++) {
      const layout = mineLayout(seeds(n), m);
      if (picks.every((t) => !layout.has(t))) survived++;
    }
    const ev = (survived / N) * multiplierFor(m, k, 0.99);
    expect(ev).toBeGreaterThan(0.99 - 0.05);
    expect(ev).toBeLessThan(0.99 + 0.05);
  });
});

describe('replay: determinism & rules', () => {
  it('is a pure function of seeds + picks', () => {
    for (let n = 0; n < 50; n++) {
      const layout = mineLayout(seeds(n), 5);
      const safe = [...Array(MINES_GRID).keys()].filter((t) => !layout.has(t)).slice(0, 3);
      const a = replay(seeds(n), 5, safe);
      const b = replay(seeds(n), 5, safe);
      expect(b).toEqual(a);
      expect(a.phase).toBe('PLAYING');
      expect(a.safeCount).toBe(3);
      expect(a.mines).toEqual([]); // never revealed while PLAYING
    }
  });

  it('a mine pick settles the round lost with the layout revealed', () => {
    for (let n = 0; n < 50; n++) {
      const layout = mineLayout(seeds(n), 5);
      const mine = [...layout][0];
      const s = replay(seeds(n), 5, [mine]);
      expect(s.phase).toBe('SETTLED');
      expect(s.win).toBe(false);
      expect(s.boomTile).toBe(mine);
      expect(s.mines).toEqual([...layout].sort((a, b) => a - b));
    }
  });

  it('opening all 25−m safe tiles settles the round won (auto-cashout)', () => {
    for (let n = 0; n < 50; n++) {
      const m = 24;
      const layout = mineLayout(seeds(n), m);
      const safe = [...Array(MINES_GRID).keys()].filter((t) => !layout.has(t));
      expect(safe).toHaveLength(1);
      const s = replay(seeds(n), m, safe);
      expect(s.phase).toBe('SETTLED');
      expect(s.win).toBe(true);
      expect(s.boomTile).toBeNull();
      expect(s.safeCount).toBe(1);
    }
  });

  it('throws on an illegal pick log (bad tile, repeat, play after settle)', () => {
    const n = 3;
    const layout = mineLayout(seeds(n), 5);
    const safe = [...Array(MINES_GRID).keys()].filter((t) => !layout.has(t));
    const mine = [...layout][0];
    expect(() => replay(seeds(n), 5, [25])).toThrow('MINES_BAD_TILE');
    expect(() => replay(seeds(n), 5, [-1])).toThrow('MINES_BAD_TILE');
    expect(() => replay(seeds(n), 5, [1.5])).toThrow('MINES_BAD_TILE');
    expect(() => replay(seeds(n), 5, [safe[0], safe[0]])).toThrow('MINES_TILE_ALREADY_OPEN');
    expect(() => replay(seeds(n), 5, [mine, safe[0]])).toThrow('MINES_ROUND_OVER');
  });
});

describe('cashout', () => {
  it('flips a live board into a settled win with the mines revealed', () => {
    const n = 11;
    const m = 5;
    const layout = mineLayout(seeds(n), m);
    const safe = [...Array(MINES_GRID).keys()].filter((t) => !layout.has(t)).slice(0, 2);
    const live = replay(seeds(n), m, safe);
    const done = cashout(seeds(n), m, live);
    expect(done.phase).toBe('SETTLED');
    expect(done.win).toBe(true);
    expect(done.safeCount).toBe(2);
    expect(done.mines).toEqual(minePositions(seeds(n), m));
  });

  it('refuses a cashout with nothing opened (mult would be RTP < 1)', () => {
    const live = replay(seeds(1), 5, []);
    expect(() => cashout(seeds(1), 5, live)).toThrow('MINES_NOTHING_TO_CASHOUT');
  });

  it('refuses a cashout on an already settled board', () => {
    const layout = mineLayout(seeds(2), 5);
    const s = replay(seeds(2), 5, [[...layout][0]]);
    expect(() => cashout(seeds(2), 5, s)).toThrow('MINES_ROUND_OVER');
  });
});
