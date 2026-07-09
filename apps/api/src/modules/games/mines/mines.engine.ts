import { BadRequestException } from '@nestjs/common';
import { floatFromSeeds } from '../../provably-fair/provably-fair.crypto';

/**
 * KuKuMBA Mines math — pure functions, no DB, fully testable (mirrors
 * ponyjack.engine / upgrader.engine).
 *
 * A 5×5 board hides m ∈ [2..24] mines. The player opens tiles one by one; every
 * safe reveal raises the cashout multiplier, a mine burns the stake. Fairness
 * model: the layout is a Fisher–Yates permutation of [0..24] where swap #i
 * draws its index from the provably-fair seed chain (cursor = i, same chain /
 * nonce as roulette), and the first m elements of the permutation are the
 * mines. Nothing about a round is stored while money is in play: the whole
 * board is a deterministic function of (serverSeed, clientSeed, nonce) + the
 * pick log, recomputed from the committed seed on every read — exactly the
 * ponyjack philosophy ("nothing secret sits in a queryable column").
 *
 * Payout law — the same one every game here obeys: the outcome is uniform and
 * honest, the edge lives ONLY in the multiplier (multiplier = RTP /
 * probability, like roulette / crash / upgrader). Surviving k opens with m
 * mines has probability P(k) = C(25−m, k) / C(25, k), so the gross cashout
 * multiplier is
 *
 *   mult(m, k) = RTP × C(25, k) / C(25−m, k)
 *              = RTP × ∏_{i=0..k−1} (25−i)/(25−m−i)   // incremental — no factorials
 *
 * and the expected cashout at ANY depth is RTP × stake — a flat edge. There is
 * NO cap on the multiplier: the ladder is honest to the very end (a full clear
 * at m=12/13 is C(25,12) = 5 200 300, ≈ ×5.15M at RTP 0.99); exposure is
 * bounded by the stake limits, never by clipping the multiplier. k = 0 gives
 * mult = RTP < 1, which is why cashing out with nothing opened is refused.
 *
 * RTP is admin-tunable per game (Game.rtp), read at start time and snapshotted
 * on the bet row so an RTP edit never changes a board already in play. A
 * garbage RTP falls back to 0.99 rather than exploding (mirrors upgrader).
 */
export const MINES_GRID = 25;
export const MINES_MIN = 2;
export const MINES_MAX = 24;

export interface Seeds {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/** Validate the mine count; throws MINES_BAD_COUNT on anything but an int 2..24. */
export function normalizeMines(mines: unknown): number {
  const m = Number(mines);
  if (!Number.isInteger(m) || m < MINES_MIN || m > MINES_MAX) {
    throw new BadRequestException('MINES_BAD_COUNT');
  }
  return m;
}

/**
 * The round's mine layout: a Fisher–Yates permutation of [0..24] where swap #i
 * draws its target from floatFromSeeds(…, cursor = i) — the mines analogue of
 * ponyjack pulling card #i through cursor = i. The first m elements of the
 * permutation are the mines. Deterministic per (seeds, m), never stored.
 */
export function mineLayout(seeds: Seeds, m: number): Set<number> {
  const tiles = Array.from({ length: MINES_GRID }, (_, i) => i);
  for (let i = 0; i < MINES_GRID - 1; i++) {
    const f = floatFromSeeds(seeds.serverSeed, seeds.clientSeed, seeds.nonce, i);
    const j = i + Math.min(MINES_GRID - 1 - i, Math.floor(f * (MINES_GRID - i)));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return new Set(tiles.slice(0, m));
}

/** The layout as a sorted array — the shape the settled view exposes. */
export function minePositions(seeds: Seeds, m: number): number[] {
  return [...mineLayout(seeds, m)].sort((a, b) => a - b);
}

/**
 * Gross cashout multiplier after k safe opens with m mines:
 * RTP × ∏_{i=0..k−1} (25−i)/(25−m−i), computed incrementally so a full clear
 * (C(25,12) ≈ 5.2M) never touches factorials. No cap — see the header.
 */
export function multiplierFor(m: number, k: number, rtp: number): number {
  const target = rtp > 0 && rtp <= 1 ? rtp : 0.99;
  let mult = target;
  for (let i = 0; i < k; i++) {
    mult *= (MINES_GRID - i) / (MINES_GRID - m - i);
  }
  return mult;
}

/** The whole cashout ladder for m mines: mult at k = 1 .. 25−m (UI renders it). */
export function multiplierLadder(m: number, rtp: number): number[] {
  return Array.from({ length: MINES_GRID - m }, (_, i) => multiplierFor(m, i + 1, rtp));
}

export interface MinesState {
  phase: 'PLAYING' | 'SETTLED';
  picks: number[];
  safeCount: number;
  boomTile: number | null;
  win: boolean;
  /** Full layout, revealed only once SETTLED — empty (and never sent) while PLAYING. */
  mines: number[];
}

/**
 * Replay a whole round from the committed seed chain + the pick log. Pure and
 * deterministic — the service persists only the picks and recomputes this on
 * every read/write. Throws on any illegal pick, so a tampered log can never
 * reach the money path. A boom settles the round lost; opening all 25−m safe
 * tiles settles it won (the auto-cashout at the top of the ladder).
 */
export function replay(seeds: Seeds, m: number, picks: number[]): MinesState {
  const layout = mineLayout(seeds, m);
  const state: MinesState = { phase: 'PLAYING', picks: [], safeCount: 0, boomTile: null, win: false, mines: [] };
  const opened = new Set<number>();
  for (const tile of picks) {
    if (state.phase === 'SETTLED') throw new BadRequestException('MINES_ROUND_OVER');
    if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_GRID) throw new BadRequestException('MINES_BAD_TILE');
    if (opened.has(tile)) throw new BadRequestException('MINES_TILE_ALREADY_OPEN');
    opened.add(tile);
    state.picks.push(tile);
    if (layout.has(tile)) {
      state.phase = 'SETTLED';
      state.boomTile = tile;
      state.win = false;
    } else {
      state.safeCount++;
      if (state.safeCount === MINES_GRID - m) {
        state.phase = 'SETTLED';
        state.win = true;
      }
    }
  }
  if (state.phase === 'SETTLED') state.mines = [...layout].sort((a, b) => a - b);
  return state;
}

/**
 * Flip a live board into a cashed-out win (mines now public). Requires at
 * least one safe open — at k = 0 the multiplier is RTP < 1, so there is
 * nothing to cash out yet.
 */
export function cashout(seeds: Seeds, m: number, state: MinesState): MinesState {
  if (state.phase !== 'PLAYING') throw new BadRequestException('MINES_ROUND_OVER');
  if (state.safeCount < 1) throw new BadRequestException('MINES_NOTHING_TO_CASHOUT');
  return { ...state, phase: 'SETTLED', win: true, mines: minePositions(seeds, m) };
}
