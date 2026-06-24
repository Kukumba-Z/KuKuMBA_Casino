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
