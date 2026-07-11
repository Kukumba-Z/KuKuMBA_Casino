import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Provably-fair primitives (Stake-style). Pure functions — no DB, fully testable.
 *
 *  outcome = f( HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`) )
 *
 * The server commits to `serverSeed` up front by publishing SHA256(serverSeed).
 * After the seed is rotated the raw serverSeed is revealed, so a player can
 * recompute every past round and confirm nothing was tampered with.
 */
export const genServerSeed = (): string => randomBytes(32).toString('hex');
export const genClientSeed = (): string => randomBytes(16).toString('hex');
export const hashServerSeed = (serverSeed: string): string =>
  createHash('sha256').update(serverSeed).digest('hex');

/** Deterministic float in [0, 1) derived from the seed chain. */
export function floatFromSeeds(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor = 0,
): number {
  const hmac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest();
  // Convert the first 4 bytes into a uniform float in [0, 1).
  let result = 0;
  for (let i = 0; i < 4; i++) {
    result += hmac[i] / Math.pow(256, i + 1);
  }
  return result;
}

/** Map a fair float to a European-roulette pocket 0..36. */
export function rouletteOutcome(float: number): number {
  return Math.floor(float * 37);
}

/** Full helper: seed chain -> pocket. */
export function rouletteResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number {
  return rouletteOutcome(floatFromSeeds(serverSeed, clientSeed, nonce));
}

/** Sexcoin coin sides: 'penis' plays the "heads" role, 'vagina' — "tails". */
export type CoinSide = 'penis' | 'vagina';

/**
 * Coinflip: float < 0.5 → 'penis' (орёл), иначе 'vagina' (решка). Flip #i of a
 * series draws its float from cursor = flipIndex on the SAME (seed, nonce) —
 * the sexcoin analogue of mines pulling shuffle swap #i through cursor = i.
 */
export function sexcoinFlip(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  flipIndex: number,
): CoinSide {
  return floatFromSeeds(serverSeed, clientSeed, nonce, flipIndex) < 0.5 ? 'penis' : 'vagina';
}

/** Crash multipliers are capped: reaching the cap is the "jackpot" finale. */
export const CRASH_MAX_MULT = 1_000_000;

/**
 * Fair float -> crash point. Same uniform float source as roulette, different
 * mapping:  P(crash ≥ m) = (1 − edge) / m,  so the expected return of cashing
 * out at ANY target m is m · (1 − edge) / m = 1 − edge — a flat house edge,
 * exactly like roulette's `multiplierFor = RTP / probability`.
 *
 *  - u < edge  -> instant crash at 1.00 (probability = house edge)
 *  - otherwise -> floor((1 − edge) / (1 − u), 2 dp), capped at CRASH_MAX_MULT
 */
export function crashFromFloat(
  float: number,
  houseEdge = 0.01,
  cap = CRASH_MAX_MULT,
): number {
  const edge = houseEdge >= 0 && houseEdge < 1 ? houseEdge : 0.01;
  if (!(float >= 0 && float < 1)) float = 0;
  if (float < edge) return 1.0;
  const raw = (1 - edge) / (1 - float);
  return Math.min(cap, Math.floor(raw * 100) / 100);
}

/** Full helper: seed chain -> crash point (mirrors rouletteResult). */
export function crashResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  houseEdge = 0.01,
): number {
  return crashFromFloat(floatFromSeeds(serverSeed, clientSeed, nonce), houseEdge);
}
