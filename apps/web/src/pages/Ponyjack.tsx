import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GameInfoModal } from '../components/GameInfoModal';
import { GameLayout } from '../components/GameLayout';
import { PlayingCard } from '../components/ponyjack/PlayingCard';
import api, { apiError } from '../lib/api';
import { betLimits, clampStake } from '../lib/bets';
import { fmt, useBalances, useCurrencies } from '../lib/hooks';
import { sfx } from '../lib/sound';
import { useAuth } from '../store/auth';
import { useUI } from '../store/ui';
import { toast } from '../store/toast';

/** The server's table view (see PonyjackService.viewOf) — the page renders it verbatim. */
interface HandView {
  cards: number[];
  total: number;
  soft: boolean;
  busted: boolean;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  result: 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | null;
}
interface TableView {
  roundId: string;
  phase: 'PLAYER' | 'SETTLED';
  status: 'PLAYING' | 'WON' | 'LOST' | 'PUSH';
  hands: HandView[];
  activeHand: number;
  actions: { hit: boolean; stand: boolean; double: boolean; split: boolean };
  dealer: { cards: number[]; hiddenCount: number; total: number; hidden: boolean };
  stake: string;
  totalStake: string;
  payout: string;
  currency: string;
  mode: string;
  autoStandAt: number | null;
  serverNow: number;
}

type RecentChip = { status: string; mult: number; bj: boolean };

/**
 * Ponyjack — pony blackjack. The page is a dumb terminal for the ponyjack API
 * (apps/api/src/modules/games/ponyjack): it only ever submits actions and
 * renders the server's view of the table, so nothing money-related lives here.
 *
 * Layout stability is deliberate: every scene section (dealer row, message
 * strip, player row, action bar) has a fixed height and the action buttons are
 * always mounted — only their disabled state changes — so nothing on the page
 * ever jumps between deal, play and settlement.
 */
export default function Ponyjack() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { mode, currency, sound, toggleSound } = useUI();

  const { data: info } = useQuery({ queryKey: ['ponyjack-info'], queryFn: async () => (await api.get('/games/ponyjack')).data });
  const { data: balances } = useBalances();
  const { data: currencies } = useCurrencies();
  const { data: seed } = useQuery({ queryKey: ['pf-seed'], enabled: authed, queryFn: async () => (await api.get('/provably-fair/seed')).data });

  const cur = currencies?.find((c) => c.code === currency);
  const limits = useMemo(() => betLimits(cur, mode), [cur, mode]);
  const bal = balances?.find((b) => b.mode === mode && b.currency === currency);

  const [view, setView] = useState<TableView | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [stakeStr, setStakeStr] = useState('10');
  // Session-only strip of recent hands (like crash's recent rounds).
  const [recent, setRecent] = useState<RecentChip[]>([]);
  // Auto-stand deadline mapped onto the local clock (server clocks may differ).
  const deadlineRef = useRef<number | null>(null);
  const cardCount = useRef(0);
  const settledRounds = useRef(new Set<string>());
  const [, forceTick] = useState(0);

  const playing = view?.phase === 'PLAYER';

  const stake = clampStake(Number(stakeStr) || limits.min, limits);
  useEffect(() => {
    setStakeStr((s) => String(clampStake(Number(s) || limits.min, limits)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, mode]);
  const setStake = (v: number) => setStakeStr(String(clampStake(v, limits)));
  const stakeNum = Number(stakeStr);
  const outOfRange = stakeStr.trim() !== '' && (stakeNum > limits.max || stakeNum < limits.min);

  /** Fold a server view into the page: sounds, deadline, recent, wallet caches. */
  const applyView = (data: TableView) => {
    const cards = data.hands.reduce((n, h) => n + h.cards.length, 0) + data.dealer.cards.length;
    if (cards > cardCount.current) sfx.card();
    cardCount.current = cards;
    deadlineRef.current = data.autoStandAt != null ? Date.now() + (data.autoStandAt - data.serverNow) : null;
    setView(data);
    if (data.phase === 'SETTLED' && !settledRounds.current.has(data.roundId)) {
      settledRounds.current.add(data.roundId);
      if (data.status === 'WON') sfx.win();
      else if (data.status === 'LOST') sfx.lose();
      const totalStake = Number(data.totalStake) || 0;
      setRecent((r) =>
        [
          {
            status: data.status,
            mult: totalStake > 0 ? Number(data.payout) / totalStake : 0,
            bj: data.hands.some((h) => h.result === 'BLACKJACK'),
          },
          ...r,
        ].slice(0, 10),
      );
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['my-bonuses'] }); // live wagering progress
      qc.invalidateQueries({ queryKey: ['pf-seed'] });
    }
  };

  // Re-attach to a hand left on the table by a reload/navigation.
  const reattached = useRef(false);
  useEffect(() => {
    if (!authed || reattached.current) return;
    reattached.current = true;
    (async () => {
      try {
        const { data } = await api.get('/games/ponyjack/active');
        if (data.active) {
          cardCount.current = 99; // don't replay deal sounds for an old table
          applyView(data);
          cardCount.current = data.hands.reduce((n: number, h: HandView) => n + h.cards.length, 0) + data.dealer.cards.length;
        }
      } catch {
        /* nothing to re-attach */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // 1s heartbeat while a hand is open: drives the auto-stand countdown and,
  // once the deadline passes, polls the round so the sweeper's verdict lands.
  useEffect(() => {
    if (!playing || !view) return;
    const id = window.setInterval(async () => {
      forceTick((x) => x + 1);
      const dl = deadlineRef.current;
      if (dl != null && Date.now() > dl + 1500 && !busy) {
        try {
          const { data } = await api.get(`/games/ponyjack/round/${view.roundId}`);
          if (data.phase === 'SETTLED') applyView(data);
        } catch {
          /* transient — next tick retries */
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, view?.roundId, busy]);

  const deal = async () => {
    if (!authed) {
      toast.error(t('ponyjack.needLogin'));
      return;
    }
    if (busy || playing) return;
    setBusy(true);
    sfx.chip();
    try {
      const { data } = await api.post('/games/ponyjack/deal', { stake, currency, mode });
      cardCount.current = 0;
      applyView(data);
      qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  const act = async (action: 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT') => {
    if (!view || !playing || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post('/games/ponyjack/action', { roundId: view.roundId, action });
      applyView(data);
      if (action === 'DOUBLE' || action === 'SPLIT') qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      toast.error(apiError(e));
    }
    setBusy(false);
  };

  // Double/split cost one extra base stake — grey them out when the wallet can't cover it.
  const canAfford = Number(bal?.amount ?? 0) >= Number(view?.stake ?? 0);
  const secondsLeft = deadlineRef.current != null ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)) : null;

  const message = useMemo(() => {
    if (!view) return { text: t('ponyjack.sceneIdle'), cls: 'text-white/50', sub: '' };
    if (view.phase === 'PLAYER') {
      const sub = secondsLeft != null && secondsLeft <= 20 ? t('ponyjack.autoIn', { s: secondsLeft }) : '';
      return { text: t('ponyjack.yourTurn'), cls: 'text-white/80', sub };
    }
    const net = `${fmt(view.payout, 2)} ${view.currency}`;
    if (view.status === 'WON') {
      const bj = view.hands.some((h) => h.result === 'BLACKJACK');
      return { text: bj ? t('ponyjack.blackjack') : t('ponyjack.win'), cls: bj ? 'holo-text' : 'text-mint', sub: `+${net}` };
    }
    if (view.status === 'PUSH') return { text: t('ponyjack.push'), cls: 'text-white/75', sub: '' };
    const allBust = view.hands.every((h) => h.busted);
    const dealerBust = view.dealer.total > 21;
    return {
      text: allBust ? t('ponyjack.bust') : dealerBust ? t('ponyjack.dealerBust') : t('ponyjack.lose'),
      cls: 'text-roul-red',
      sub: `−${fmt(view.totalStake, 2)} ${view.currency}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, secondsLeft, t]);

  const resultLabel = (r: HandView['result']) =>
    r === 'BLACKJACK' ? t('ponyjack.resBj') : r === 'WIN' ? t('ponyjack.resWin') : r === 'PUSH' ? t('ponyjack.resPush') : t('ponyjack.resLose');
  const resultCls = (r: HandView['result']) =>
    r === 'BLACKJACK'
      ? 'border-sun/40 bg-sun/15 text-sun'
      : r === 'WIN'
        ? 'border-mint/40 bg-mint/15 text-mint'
        : r === 'PUSH'
          ? 'border-white/20 bg-white/10 text-white/70'
          : 'border-roul-red/40 bg-roul-red/15 text-roul-red';

  const chipCls = (c: RecentChip) =>
    c.bj ? 'text-sun' : c.status === 'WON' ? 'text-mint' : c.status === 'PUSH' ? 'text-white/60' : 'text-roul-red';

  const actionBtns: { key: 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT'; label: string; cls: string; enabled: boolean }[] = [
    { key: 'HIT', label: t('ponyjack.hit'), cls: 'border-mint/40 bg-mint/10 text-mint hover:bg-mint/20', enabled: !!view?.actions.hit },
    { key: 'STAND', label: t('ponyjack.stand'), cls: 'border-sun/40 bg-sun/10 text-sun hover:bg-sun/20', enabled: !!view?.actions.stand },
    { key: 'DOUBLE', label: t('ponyjack.double'), cls: 'border-sky/40 bg-sky/10 text-sky hover:bg-sky/20', enabled: !!view?.actions.double && canAfford },
    { key: 'SPLIT', label: t('ponyjack.split'), cls: 'border-bubble/40 bg-bubble/10 text-bubble hover:bg-bubble/20', enabled: !!view?.actions.split && canAfford },
  ];

  return (
    <GameLayout
      aside={
        <>
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <div className="mb-2 text-xs font-semibold text-white/55">{t('ponyjack.stake')}</div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  {outOfRange && (
                    <div className="absolute bottom-full left-0 z-20 mb-1 rounded-lg border border-white/10 bg-night px-2.5 py-1.5 text-[11px] font-medium text-white/80 shadow-card">
                      {t('roulette.limits')}: {fmt(limits.min, 2)}–{fmt(limits.max, 2)} {currency}
                    </div>
                  )}
                  <input
                    value={stakeStr}
                    onChange={(e) => setStakeStr(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                    onBlur={() => setStakeStr(String(stake))}
                    inputMode="decimal"
                    disabled={busy || playing}
                    aria-invalid={outOfRange}
                    aria-label={t('ponyjack.stake')}
                    className={`input !py-3 pr-14 text-right font-extrabold tabular-nums ${outOfRange ? '!border-roul-red' : ''}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40">
                    {currency}
                  </span>
                </div>
                <button onClick={() => setStake(stake / 2)} className="btn-ghost !px-3" disabled={busy || playing}>½</button>
                <button onClick={() => setStake(stake * 2)} className="btn-ghost !px-3" disabled={busy || playing}>2×</button>
                <button
                  onClick={() => setStake(Math.min(limits.max, Number(bal?.amount ?? limits.max)))}
                  className="btn-ghost !px-3 text-xs"
                  disabled={busy || playing}
                >
                  {t('roulette.maxBtn')}
                </button>
              </div>
            </div>

            <button onClick={deal} disabled={busy || playing || !(info?.enabled ?? true)} className={`pj-deal ${playing ? 'pj-deal-mute' : 'pj-deal-primary'}`}>
              <span className="font-display text-lg font-black">{playing ? t('ponyjack.inPlay') : t('ponyjack.deal')}</span>
              <span className="text-sm font-bold opacity-85">{playing ? '' : `${fmt(stake, 2)} ${currency}`}</span>
            </button>
            {!authed && (
              <div className="text-center text-sm text-white/50">
                <Link to="/login" className="text-lav hover:underline">
                  {t('common.login')}
                </Link>{' '}
                · {t('ponyjack.needLogin')}
              </div>
            )}
          </div>

          {/* recent hands — this visit only; cleared when leaving the page */}
          <div className="card p-3.5">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-white/45">{t('ponyjack.recent')}</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.length === 0 && <span className="text-sm text-white/35">{t('ponyjack.recentEmpty')}</span>}
              {recent.map((c, i) => (
                <span key={i} className={`rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-display text-xs font-extrabold ${chipCls(c)}`}>
                  {c.bj ? 'PJ ' : ''}{c.mult.toFixed(2)}×
                </span>
              ))}
            </div>
          </div>
        </>
      }
    >
      {/* Table scene — every section keeps a fixed height so nothing jumps. */}
      <div className="card relative overflow-hidden">
        <div className="relative flex flex-col justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
          {/* felt glow + arc */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_90%_at_50%_-10%,rgba(126,231,199,0.08),transparent_60%),radial-gradient(120%_100%_at_50%_115%,rgba(183,156,237,0.14),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-[62%] left-1/2 h-[95%] w-[135%] -translate-x-1/2 rounded-[50%] border-t-2 border-white/10 bg-white/[0.02]" />

          {/* dealer */}
          <div className="relative flex flex-col items-center gap-2.5">
            <span className="chip text-[11px] font-bold uppercase tracking-wider text-white/60">
              {t('ponyjack.dealer')}
              <span className="tabular-nums text-white/85">{view ? (view.dealer.hidden ? `${view.dealer.total}+?` : view.dealer.total) : '—'}</span>
            </span>
            <CardRow cards={view ? [...view.dealer.cards, ...Array(view.dealer.hiddenCount).fill(null)] : null} flipIndex={1} />
          </div>

          {/* verdict / turn strip (fixed height) */}
          <div className="relative grid h-16 place-items-center text-center">
            <div>
              <div className={`font-display text-xl font-black sm:text-2xl ${message.cls}`}>{message.text}</div>
              <div className="h-5 text-sm font-bold tabular-nums text-white/60">{message.sub}</div>
            </div>
          </div>

          {/* player hands */}
          <div className="relative flex items-end justify-center gap-3 sm:gap-6">
            {(view?.hands ?? [null]).map((hand: HandView | null, i: number) => {
              const isActive = !!view && playing && view.activeHand === i && view.hands.length > 1;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-2.5 rounded-2xl px-2 pb-1 pt-2 transition ${
                    isActive ? 'bg-mint/[0.06] ring-1 ring-mint/50' : ''
                  }`}
                >
                  <CardRow cards={hand ? hand.cards : null} />
                  <span className="chip h-7 text-[11px] font-bold">
                    {hand ? (
                      <>
                        <span className="tabular-nums text-white/85">{hand.total}</span>
                        {hand.doubled && <span className="text-sky">{t('ponyjack.doubledTag')}</span>}
                        {hand.result && <span className={`-mr-1 rounded-full border px-1.5 py-0.5 text-[10px] ${resultCls(hand.result)}`}>{resultLabel(hand.result)}</span>}
                      </>
                    ) : (
                      <span className="text-white/40">{t('ponyjack.hand')}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* corner controls */}
        <button
          type="button"
          onClick={toggleSound}
          className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-white/70 backdrop-blur transition hover:bg-white/10"
          aria-label={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
          title={sound ? t('roulette.soundOff') : t('roulette.soundOn')}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} className="text-white/40" />}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-night/55 text-mint backdrop-blur transition hover:bg-white/10"
          aria-label={t('roulette.info')}
          title={t('roulette.info')}
        >
          <Shield size={18} />
        </button>
      </div>

      {/* actions — always mounted, fixed height; only disabled state changes */}
      <div className="card grid grid-cols-4 gap-2 p-3">
        {actionBtns.map((b) => (
          <button
            key={b.key}
            onClick={() => act(b.key)}
            disabled={!playing || busy || !b.enabled}
            className={`flex h-14 items-center justify-center rounded-2xl border font-display text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${b.cls}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Info, rules & fairness — same shared dialog as roulette/crash. */}
      <GameInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={<span className="holo-text">{info?.name ?? t('ponyjack.title')}</span>}
        rtp={info?.rtp ?? 0.995}
        descriptionRu={info?.descriptionRu}
        descriptionEn={info?.descriptionEn}
        bets={info?.bets}
        limits={limits}
        currency={currency}
        seed={authed ? seed : null}
        onRotateSeed={async () => {
          try {
            await api.post('/provably-fair/seed/rotate', {});
            qc.invalidateQueries({ queryKey: ['pf-seed'] });
            toast.success(t('roulette.rotated'));
          } catch (e) {
            toast.error(apiError(e));
          }
        }}
      />
    </GameLayout>
  );
}

/**
 * A fan of cards in a fixed-height slot. `null` renders the card back (the
 * dealer's unrevealed hole card); when the server later fills that slot with a
 * real card, the same position 3D-flips face-up instead of re-mounting.
 * `cards === null` (no round yet) shows two dashed placeholders, so the very
 * first deal doesn't change the scene's geometry.
 */
function CardRow({ cards, flipIndex = -1 }: { cards: (number | null)[] | null; flipIndex?: number }) {
  return (
    <div className="flex h-[92px] items-center justify-center sm:h-[110px]">
      {cards === null ? (
        <>
          <div className="h-full w-[66px] rounded-lg border-2 border-dashed border-white/10 sm:w-[79px]" />
          <div className="-ml-8 h-full w-[66px] rounded-lg border-2 border-dashed border-white/10 sm:-ml-9 sm:w-[79px]" />
        </>
      ) : (
        cards.map((c, i) => (
          <div key={i} className={`h-full w-[66px] sm:w-[79px] ${i > 0 ? '-ml-8 sm:-ml-9' : ''}`} style={{ zIndex: i }}>
            {i === flipIndex ? (
              <FlipCard card={c} />
            ) : (
              <div className="h-full w-full animate-fadeup" style={i > 1 ? { animationDelay: `${(i - 2) * 180 + 250}ms` } : undefined}>
                <PlayingCard card={c} className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]" />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/** Back-to-face 3D flip for the dealer's hole card. */
function FlipCard({ card }: { card: number | null }) {
  const revealed = card != null;
  return (
    <div className="h-full w-full animate-fadeup [perspective:700px]">
      <div
        className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${
          revealed ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <PlayingCard card={null} className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]" />
        </div>
        <div className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]">
          {revealed && <PlayingCard card={card} className="h-full w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]" />}
        </div>
      </div>
    </div>
  );
}
