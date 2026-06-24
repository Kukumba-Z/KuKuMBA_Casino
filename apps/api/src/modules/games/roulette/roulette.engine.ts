import { BadRequestException } from '@nestjs/common';
import { BETS, POCKETS, RouletteBetType } from './roulette.constants';

/**
 * The math that makes RTP exactly configurable.
 *
 *   probability(bet)  = winningPockets / 37
 *   grossMultiplier   = RTP / probability        // includes the stake
 *   expectedReturn    = probability * grossMultiplier = RTP   (for every bet type)
 *
 * So with RTP = 0.99 the house edge is a flat 1% on red/black, straight-up,
 * dozens, columns — everything. Nothing about the wheel is rigged: the pocket
 * is drawn uniformly (provably-fair). Only the payout table carries the edge.
 */
export function multiplierFor(betType: RouletteBetType, rtp: number): number {
  const def = BETS[betType];
  if (!def) throw new BadRequestException(`UNKNOWN_BET_TYPE:${betType}`);
  const probability = def.winningCount / POCKETS;
  return rtp / probability;
}

export function isWin(betType: RouletteBetType, selection: any, outcome: number): boolean {
  const def = BETS[betType];
  if (!def) throw new BadRequestException(`UNKNOWN_BET_TYPE:${betType}`);
  return def.wins(outcome, selection);
}

/** Validate a bet's shape before any money moves. */
export function validateBet(betType: string, selection: any) {
  const def = BETS[betType as RouletteBetType];
  if (!def) throw new BadRequestException(`UNKNOWN_BET_TYPE:${betType}`);
  if (betType === 'STRAIGHT') {
    const n = Number(selection?.number);
    if (!Number.isInteger(n) || n < 0 || n > 36) {
      throw new BadRequestException('STRAIGHT bet requires selection.number in 0..36');
    }
  }
}

export interface SettledBet {
  win: boolean;
  multiplier: number;
  /** Gross amount returned to the player on a win (stake * multiplier), else 0. */
  payout: number;
}

/** Settle a single bet given the drawn pocket. Numbers only (DB layer uses Decimal). */
export function settleBet(
  betType: RouletteBetType,
  selection: any,
  stake: number,
  outcome: number,
  rtp: number,
): SettledBet {
  const win = isWin(betType, selection, outcome);
  const multiplier = multiplierFor(betType, rtp);
  return { win, multiplier, payout: win ? stake * multiplier : 0 };
}
