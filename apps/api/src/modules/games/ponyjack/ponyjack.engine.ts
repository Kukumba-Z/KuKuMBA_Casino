import { BadRequestException } from '@nestjs/common';
import { floatFromSeeds } from '../../provably-fair/provably-fair.crypto';

/**
 * Ponyjack (blackjack) math — pure functions, no DB, fully testable (mirrors
 * roulette.engine / crash.engine).
 *
 * Fairness model: the game uses an INFINITE SHOE — every card is an independent
 * uniform draw from the provably-fair seed chain, card #i = ⌊float(seed, cursor=i)·52⌋.
 * Nothing about a round is stored while money is in play: the entire table
 * (including the dealer's hole card) is a deterministic function of
 * (serverSeed, clientSeed, nonce) + the player's action log, and is recomputed
 * from the committed seed on every read — exactly the crash-game philosophy
 * ("nothing secret sits in a queryable column").
 *
 * Rules (fixed): dealer stands on all 17s, dealer peeks for blackjack, double
 * on any two cards (incl. after split), split once on equal-value pairs, split
 * aces get one card each, no insurance/surrender. Under optimal play this rule
 * set returns ≈99.5% — that is the BASE_RTP below.
 *
 * RTP is exactly configurable the same way as roulette ("only the payout table
 * carries the edge"): win/blackjack multipliers are scaled by rtp / BASE_RTP,
 * so an admin retune flows straight into payouts while the cards stay uniform.
 * A push always returns the stake unscaled. The quoted RTP assumes optimal
 * basic strategy — player mistakes lower the realized return, as in any
 * blackjack.
 */
export const PONYJACK_BASE_RTP = 0.995;

/** Gross payout scale applied to win/blackjack multipliers for a target RTP. */
export function payoutScale(rtp: number): number {
  const r = rtp > 0 && rtp <= 1 ? rtp : PONYJACK_BASE_RTP;
  return r / PONYJACK_BASE_RTP;
}

/** Gross multiplier (stake included) for a regular win. 2.00 at the base RTP. */
export const winMultiplier = (rtp: number): number => 2 * payoutScale(rtp);

/** Gross multiplier for a natural blackjack (3:2). 2.50 at the base RTP. */
export const blackjackMultiplier = (rtp: number): number => 2.5 * payoutScale(rtp);

// ── Cards ────────────────────────────────────────────────────────────────

export interface Seeds {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

/** Card #cursor of the round: an independent uniform draw from 0..51. */
export function cardAt(seeds: Seeds, cursor: number): number {
  const f = floatFromSeeds(seeds.serverSeed, seeds.clientSeed, seeds.nonce, cursor);
  return Math.min(51, Math.floor(f * 52));
}

/** Rank index 0..12 → A,2,3,…,10,J,Q,K. */
export const rankOf = (card: number): number => card % 13;
/** Suit index 0..3 → ♠,♥,♦,♣ (presentation decides the glyphs). */
export const suitOf = (card: number): number => Math.floor(card / 13);

/** Blackjack value of a single card (ace counted 11 here; handValue softens it). */
export function cardValue(card: number): number {
  const r = rankOf(card);
  if (r === 0) return 11;
  return r >= 9 ? 10 : r + 1;
}

/** Best blackjack total of a hand + whether an ace is still counted as 11. */
export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBust = (cards: number[]): boolean => handValue(cards).total > 21;
/** A natural: 21 from the first two cards (only possible pre-split). */
export const isBlackjack = (cards: number[]): boolean =>
  cards.length === 2 && handValue(cards).total === 21;

// ── Game state (replayed, never stored) ──────────────────────────────────

export type PonyjackAction = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT';
export const PONYJACK_ACTIONS: PonyjackAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT'];

export type HandResult = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE';

export interface PonyHand {
  cards: number[];
  /** Stake on this hand in units of the base stake (2 after a double). */
  stakeMult: number;
  doubled: boolean;
  fromSplit: boolean;
  /** No more decisions for this hand (stood, doubled, busted or auto-21). */
  done: boolean;
  result?: HandResult;
}

export interface PonyjackState {
  phase: 'PLAYER' | 'SETTLED';
  hands: PonyHand[];
  /** Index of the hand awaiting a decision (meaningful while phase=PLAYER). */
  active: number;
  /** Dealer cards: [up, hole, …draws]. The hole is presentation-hidden until settled. */
  dealer: number[];
  /** Next seed-chain cursor (= cards drawn so far). */
  cursor: number;
  dealerBlackjack: boolean;
  /** Settlement summary (phase=SETTLED), in units of the base stake. */
  dealerTotal: number;
  stakeMult: number;
  returnMult: number;
}

const illegal = (why: string): never => {
  throw new BadRequestException(`PJ_ILLEGAL_ACTION:${why}`);
};

/** What the active hand may legally do right now. */
export function availableActions(s: PonyjackState): Record<Lowercase<PonyjackAction>, boolean> {
  if (s.phase !== 'PLAYER') return { hit: false, stand: false, double: false, split: false };
  const hand = s.hands[s.active];
  const two = hand.cards.length === 2 && !hand.done;
  return {
    hit: !hand.done,
    stand: !hand.done,
    double: two,
    split:
      two &&
      s.hands.length === 1 &&
      cardValue(hand.cards[0]) === cardValue(hand.cards[1]),
  };
}

/**
 * Replay a whole round from the committed seed chain + the action log. Pure and
 * deterministic — the service persists only the actions and recomputes this on
 * every read/write. Throws on any illegal action, so a tampered log can never
 * reach the money path.
 */
export function replay(seeds: Seeds, actions: PonyjackAction[]): PonyjackState {
  const s: PonyjackState = {
    phase: 'PLAYER',
    hands: [{ cards: [], stakeMult: 1, doubled: false, fromSplit: false, done: false }],
    active: 0,
    dealer: [],
    cursor: 0,
    dealerBlackjack: false,
    dealerTotal: 0,
    stakeMult: 1,
    returnMult: 0,
  };
  const draw = () => cardAt(seeds, s.cursor++);

  // Initial deal: player, dealer up, player, dealer hole.
  s.hands[0].cards.push(draw());
  s.dealer.push(draw());
  s.hands[0].cards.push(draw());
  s.dealer.push(draw());
  s.dealerBlackjack = isBlackjack(s.dealer);

  // Dealer peek: a natural on either side settles before any decision.
  if (s.dealerBlackjack || isBlackjack(s.hands[0].cards)) {
    s.hands[0].done = true;
    settle(s);
  }

  for (const a of actions) {
    if (s.phase !== 'PLAYER') illegal('ROUND_SETTLED');
    const hand = s.hands[s.active];
    switch (a) {
      case 'HIT': {
        if (hand.done) illegal('HAND_DONE');
        hand.cards.push(draw());
        const { total } = handValue(hand.cards);
        if (total >= 21) hand.done = true; // bust, or auto-stand on 21
        break;
      }
      case 'STAND': {
        if (hand.done) illegal('HAND_DONE');
        hand.done = true;
        break;
      }
      case 'DOUBLE': {
        if (hand.done || hand.cards.length !== 2) illegal('DOUBLE_NEEDS_TWO_CARDS');
        hand.stakeMult = 2;
        hand.doubled = true;
        hand.cards.push(draw());
        hand.done = true;
        break;
      }
      case 'SPLIT': {
        if (
          hand.done ||
          s.hands.length !== 1 ||
          hand.cards.length !== 2 ||
          cardValue(hand.cards[0]) !== cardValue(hand.cards[1])
        ) {
          illegal('SPLIT_NEEDS_PAIR');
        }
        s.hands = [
          { cards: [hand.cards[0]], stakeMult: 1, doubled: false, fromSplit: true, done: false },
          { cards: [hand.cards[1]], stakeMult: 1, doubled: false, fromSplit: true, done: false },
        ];
        s.active = 0;
        break;
      }
      default:
        illegal('UNKNOWN_ACTION');
    }
    advance(s, draw);
  }
  return s;
}

/**
 * Keep the table invariant after every action: the active hand always holds ≥2
 * cards while a decision is pending; when every hand is done the dealer plays.
 */
function advance(s: PonyjackState, draw: () => number) {
  for (;;) {
    const idx = s.hands.findIndex((h) => !h.done);
    if (idx === -1) {
      dealerPlay(s, draw);
      settle(s);
      return;
    }
    s.active = idx;
    const hand = s.hands[idx];
    if (hand.cards.length >= 2) return; // awaiting a real decision
    // A fresh split hand receives its second card only when play reaches it,
    // so the card order stays strictly sequential (provably replayable).
    hand.cards.push(draw());
    const { total } = handValue(hand.cards);
    // Split aces get exactly one card; any 21 auto-stands.
    if ((hand.fromSplit && cardValue(hand.cards[0]) === 11) || total >= 21) {
      hand.done = true;
      continue;
    }
    return;
  }
}

/** Dealer reveals and draws to 17 (stands on all 17s) — only if someone survived. */
function dealerPlay(s: PonyjackState, draw: () => number) {
  if (s.hands.every((h) => isBust(h.cards))) return;
  while (handValue(s.dealer).total < 17) s.dealer.push(draw());
}

/** Grade every hand against the dealer. Multipliers are applied by the caller. */
function settle(s: PonyjackState) {
  const dealer = handValue(s.dealer).total;
  const dealerBust = dealer > 21;
  for (const hand of s.hands) {
    if (!hand.fromSplit && isBlackjack(hand.cards)) {
      hand.result = s.dealerBlackjack ? 'PUSH' : 'BLACKJACK';
      continue;
    }
    if (s.dealerBlackjack) {
      hand.result = 'LOSE';
      continue;
    }
    const { total } = handValue(hand.cards);
    if (total > 21) hand.result = 'LOSE';
    else if (dealerBust || total > dealer) hand.result = 'WIN';
    else if (total === dealer) hand.result = 'PUSH';
    else hand.result = 'LOSE';
  }
  s.phase = 'SETTLED';
  s.dealerTotal = dealer;
  s.stakeMult = s.hands.reduce((sum, h) => sum + h.stakeMult, 0);
  s.returnMult = 0; // filled by grossReturnMult (needs the RTP snapshot)
}

/** Total gross return in units of the base stake, at the round's snapshotted RTP. */
export function grossReturnMult(s: PonyjackState, rtp: number): number {
  if (s.phase !== 'SETTLED') return 0;
  let sum = 0;
  for (const hand of s.hands) {
    switch (hand.result) {
      case 'BLACKJACK':
        sum += hand.stakeMult * blackjackMultiplier(rtp);
        break;
      case 'WIN':
        sum += hand.stakeMult * winMultiplier(rtp);
        break;
      case 'PUSH':
        sum += hand.stakeMult;
        break;
      default:
        break;
    }
  }
  return sum;
}

/**
 * Complete an abandoned round: stand every pending hand. Used by the sweeper so
 * money can never get stuck in-flight (the blackjack analogue of the crash
 * sweeper's clock-decided settlement).
 */
export function autoFinishActions(seeds: Seeds, actions: PonyjackAction[]): PonyjackAction[] {
  const out = [...actions];
  // ≤ 2 hands, each needing at most one STAND — 4 is a safe hard stop.
  for (let i = 0; i < 4; i++) {
    if (replay(seeds, out).phase === 'SETTLED') break;
    out.push('STAND');
  }
  return out;
}
