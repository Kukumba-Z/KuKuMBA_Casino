import { describe, expect, it } from 'vitest';
import { genClientSeed, genServerSeed } from '../../provably-fair/provably-fair.crypto';
import {
  autoFinishActions,
  availableActions,
  blackjackMultiplier,
  cardAt,
  cardValue,
  grossReturnMult,
  handValue,
  isBlackjack,
  PONYJACK_BASE_RTP,
  PonyjackAction,
  rankOf,
  replay,
  Seeds,
  suitOf,
  winMultiplier,
} from './ponyjack.engine';

const seeds = (nonce: number): Seeds => ({
  serverSeed: 'a'.repeat(64),
  clientSeed: 'b'.repeat(32),
  nonce,
});

describe('cards & hand values', () => {
  it('cards are uniform draws in 0..51, deterministic per (seed, cursor)', () => {
    const s = seeds(1);
    const seen = new Set<number>();
    for (let cursor = 0; cursor < 2000; cursor++) {
      const c = cardAt(s, cursor);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(51);
      expect(cardAt(s, cursor)).toBe(c);
      seen.add(c);
    }
    expect(seen.size).toBe(52); // every card shows up across 2000 draws
    expect(rankOf(51)).toBe(12);
    expect(suitOf(51)).toBe(3);
  });

  it('values aces 11/1 and faces 10', () => {
    // rank indexes: 0=A, 8=9, 9=10, 10=J, 11=Q, 12=K
    expect(cardValue(0)).toBe(11);
    expect(cardValue(9)).toBe(10);
    expect(cardValue(10)).toBe(10);
    expect(cardValue(12)).toBe(10);
    expect(handValue([0, 9])).toEqual({ total: 21, soft: true }); // A+10 natural
    expect(handValue([0, 0])).toEqual({ total: 12, soft: true }); // A+A
    expect(handValue([0, 5, 9])).toEqual({ total: 17, soft: false }); // A+6+10 hard 17
    expect(isBlackjack([0, 12])).toBe(true);
    expect(isBlackjack([0, 5, 4])).toBe(false); // 21 in three cards is not a natural
  });
});

describe('payout table follows the configured RTP', () => {
  it('classic 1:1 / 3:2 at the base RTP, scaled linearly otherwise', () => {
    expect(winMultiplier(PONYJACK_BASE_RTP)).toBeCloseTo(2, 10);
    expect(blackjackMultiplier(PONYJACK_BASE_RTP)).toBeCloseTo(2.5, 10);
    expect(winMultiplier(0.95)).toBeCloseTo(2 * (0.95 / PONYJACK_BASE_RTP), 10);
    expect(blackjackMultiplier(0.9)).toBeCloseTo(2.5 * (0.9 / PONYJACK_BASE_RTP), 10);
    // garbage RTP falls back to the base table instead of exploding
    expect(winMultiplier(0)).toBeCloseTo(2, 10);
    expect(winMultiplier(5)).toBeCloseTo(2, 10);
  });
});

describe('replay: determinism & rules', () => {
  it('is a pure function of seeds + actions', () => {
    for (let n = 0; n < 50; n++) {
      const a = replay(seeds(n), []);
      const b = replay(seeds(n), []);
      expect(b).toEqual(a);
    }
  });

  it('deals P,D,P,D and settles naturals before any action', () => {
    for (let n = 0; n < 500; n++) {
      const s = replay(seeds(n), []);
      expect(s.hands[0].cards[0]).toBe(cardAt(seeds(n), 0));
      expect(s.dealer[0]).toBe(cardAt(seeds(n), 1));
      expect(s.hands[0].cards[1]).toBe(cardAt(seeds(n), 2));
      expect(s.dealer[1]).toBe(cardAt(seeds(n), 3));
      const natural = isBlackjack(s.hands[0].cards) || isBlackjack(s.dealer);
      expect(s.phase).toBe(natural ? 'SETTLED' : 'PLAYER');
      if (s.phase === 'SETTLED') {
        // no further play is accepted once settled
        expect(() => replay(seeds(n), ['HIT'])).toThrow();
        if (isBlackjack(s.hands[0].cards) && !isBlackjack(s.dealer)) {
          expect(s.hands[0].result).toBe('BLACKJACK');
          expect(grossReturnMult(s, PONYJACK_BASE_RTP)).toBeCloseTo(2.5, 10);
        }
        if (isBlackjack(s.hands[0].cards) && isBlackjack(s.dealer)) {
          expect(s.hands[0].result).toBe('PUSH');
          expect(grossReturnMult(s, PONYJACK_BASE_RTP)).toBeCloseTo(1, 10);
        }
        if (!isBlackjack(s.hands[0].cards) && isBlackjack(s.dealer)) {
          expect(s.hands[0].result).toBe('LOSE');
          expect(grossReturnMult(s, PONYJACK_BASE_RTP)).toBe(0);
        }
      }
    }
  });

  it('STAND ends the round: dealer draws to ≥17 and every hand is graded', () => {
    for (let n = 0; n < 500; n++) {
      if (replay(seeds(n), []).phase === 'SETTLED') continue;
      const s = replay(seeds(n), ['STAND']);
      expect(s.phase).toBe('SETTLED');
      expect(handValue(s.dealer).total).toBeGreaterThanOrEqual(17);
      expect(s.hands[0].result).toBeDefined();
      const player = handValue(s.hands[0].cards).total;
      const dealer = s.dealerTotal;
      if (dealer > 21 || player > dealer) expect(s.hands[0].result).toBe('WIN');
      else if (player === dealer) expect(s.hands[0].result).toBe('PUSH');
      else expect(s.hands[0].result).toBe('LOSE');
    }
  });

  it('HIT draws sequentially; bust or 21 finishes the hand', () => {
    for (let n = 0; n < 300; n++) {
      if (replay(seeds(n), []).phase === 'SETTLED') continue;
      const s = replay(seeds(n), ['HIT']);
      const { total } = handValue(s.hands[0].cards);
      if (total > 21) {
        expect(s.phase).toBe('SETTLED');
        expect(s.hands[0].result).toBe('LOSE');
        // dealer never draws when everyone busted
        expect(s.dealer).toHaveLength(2);
        expect(grossReturnMult(s, PONYJACK_BASE_RTP)).toBe(0);
      } else if (total === 21) {
        expect(s.phase).toBe('SETTLED'); // auto-stand on 21 → dealer plays
      } else {
        expect(s.phase).toBe('PLAYER');
        expect(s.hands[0].done).toBe(false);
      }
    }
  });

  it('DOUBLE doubles the stake, takes exactly one card and ends the hand', () => {
    for (let n = 0; n < 400; n++) {
      if (replay(seeds(n), []).phase === 'SETTLED') continue;
      const s = replay(seeds(n), ['DOUBLE']);
      expect(s.phase).toBe('SETTLED');
      expect(s.hands[0].cards).toHaveLength(3);
      expect(s.hands[0].stakeMult).toBe(2);
      expect(s.stakeMult).toBe(2);
      if (s.hands[0].result === 'WIN') {
        expect(grossReturnMult(s, PONYJACK_BASE_RTP)).toBeCloseTo(4, 10);
      }
      // double after a hit is illegal
      const t = replay(seeds(n), ['HIT']);
      if (t.phase === 'PLAYER') expect(() => replay(seeds(n), ['HIT', 'DOUBLE'])).toThrow();
    }
  });

  it('SPLIT plays two hands with a per-hand stake; only equal values split', () => {
    let splits = 0;
    for (let n = 0; n < 3000 && splits < 25; n++) {
      const dealt = replay(seeds(n), []);
      if (dealt.phase !== 'PLAYER') continue;
      const [c1, c2] = dealt.hands[0].cards;
      if (cardValue(c1) !== cardValue(c2)) {
        expect(() => replay(seeds(n), ['SPLIT'])).toThrow();
        continue;
      }
      splits++;
      const s = replay(seeds(n), ['SPLIT']);
      expect(s.hands).toHaveLength(2);
      expect(s.hands[0].cards[0]).toBe(c1);
      expect(s.hands[1].cards[0]).toBe(c2);
      if (cardValue(c1) === 11) {
        // split aces: one card each, no decisions, straight to the dealer
        expect(s.phase).toBe('SETTLED');
        expect(s.hands[0].cards).toHaveLength(2);
        expect(s.hands[1].cards).toHaveLength(2);
      } else if (s.phase === 'PLAYER') {
        // no resplit, but hit/stand/double stay available
        expect(availableActions(s).split).toBe(false);
        expect(availableActions(s).hit).toBe(true);
        const done = autoFinishActions(seeds(n), ['SPLIT']);
        const final = replay(seeds(n), done);
        expect(final.phase).toBe('SETTLED');
        expect(final.stakeMult).toBe(2);
        expect(final.hands.every((h) => h.result)).toBe(true);
        // a split 21 is a plain 21, never a 3:2 natural
        for (const h of final.hands) expect(h.result === 'BLACKJACK').toBe(false);
      }
      splits++;
    }
    expect(splits).toBeGreaterThan(0);
  });

  it('autoFinishActions settles any position (the sweeper can always close a round)', () => {
    for (let n = 0; n < 300; n++) {
      const done = autoFinishActions(seeds(n), []);
      expect(replay(seeds(n), done).phase).toBe('SETTLED');
    }
  });
});

describe('empirical RTP', () => {
  /** Mimic-the-dealer strategy: hit below 17. ~94% expected with 3:2 naturals. */
  function playRound(n: number, rtp: number): { staked: number; returned: number } {
    const sd = seeds(n);
    const actions: PonyjackAction[] = [];
    for (let guard = 0; guard < 24; guard++) {
      const s = replay(sd, actions);
      if (s.phase === 'SETTLED') {
        return { staked: s.stakeMult, returned: grossReturnMult(s, rtp) };
      }
      actions.push(handValue(s.hands[s.active].cards).total < 17 ? 'HIT' : 'STAND');
    }
    throw new Error('round did not settle');
  }

  it('mimic-the-dealer returns ~94% at the base RTP', () => {
    let staked = 0;
    let returned = 0;
    for (let n = 0; n < 30_000; n++) {
      const r = playRound(n, PONYJACK_BASE_RTP);
      staked += r.staked;
      returned += r.returned;
    }
    const rtp = returned / staked;
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(0.98);
  });

  it('an admin RTP retune scales the realized return proportionally', () => {
    let base = 0;
    let tuned = 0;
    let staked = 0;
    for (let n = 0; n < 20_000; n++) {
      base += playRound(n, PONYJACK_BASE_RTP).returned;
      tuned += playRound(n, 0.9).returned;
      staked += playRound(n, 0.9).staked;
    }
    // pushes return the stake unscaled, so the tuned return sits between the
    // fully-scaled floor and the base ceiling
    expect(tuned).toBeLessThan(base);
    expect(tuned / base).toBeGreaterThan(0.9 / PONYJACK_BASE_RTP - 0.05);
    expect(staked).toBeGreaterThan(0);
  });
});
