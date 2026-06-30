import { Trophy } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt } from '../lib/hooks';

export interface DrawParticipant {
  username: string;
  accountId: number;
}
export interface DrawWinner extends DrawParticipant {
  prize: string;
  rank: number;
}

const CELL_W = 132; // px, must match the rendered cell width below (incl. gap)

/** Each cell is a participant handle; `win` flags the landing winner for the current spin. */
interface Cell {
  key: string;
  name: string;
  win: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Provably-fair raffle reveal. A horizontal ribbon of participant handles spins
 * under a fixed centre pointer, accelerating then easing to a stop on the real
 * winner from the server draw. The ribbon length (and so the apparent top speed)
 * grows with the participant count — one extra "gear" every 50 participants.
 * For multiple winners it spins once per winner, revealing each in turn.
 *
 * `autoPlay` drives the live, synchronized reveal. When false (a raffle that was
 * already completed before the page opened) the reel renders its final landed
 * state immediately — no re-spin — so revisiting history doesn't replay the show.
 */
export default function RaffleDraw({
  participants,
  winners,
  currency,
  autoPlay = true,
}: {
  participants: DrawParticipant[];
  winners: DrawWinner[];
  currency: string;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Live runs start at the first winner; static (historical) jumps straight to the end.
  const [stage, setStage] = useState(autoPlay ? 0 : winners.length); // index of the winner being spun to
  const [revealed, setRevealed] = useState<DrawWinner[]>(autoPlay ? [] : winners);
  const [spinning, setSpinning] = useState(false);
  const timers = useRef<number[]>([]);

  // More participants → longer ribbon → higher peak speed for the same duration.
  const speedTier = 1 + Math.floor(participants.length / 50);

  const names = useMemo(
    () => (participants.length ? participants.map((p) => p.username) : winners.map((w) => w.username)),
    [participants, winners],
  );

  useLayoutEffect(() => {
    const measure = () => setWidth(wrapRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Clamp so the final winner's ribbon stays on screen after the last spin lands.
  const stageIdx = Math.min(stage, winners.length - 1);

  // Build the ribbon for the current stage so the winner sits a few cells from the end.
  const cells = useMemo<Cell[]>(() => {
    const winner = winners[stageIdx];
    if (!winner) return [];
    const spinCells = Math.min(120, 22 * speedTier + 8);
    const winnerIdx = spinCells - 5;
    const pool = names.length ? names : [winner.username];
    let bag = shuffle(pool);
    let bi = 0;
    const out: Cell[] = [];
    for (let i = 0; i < spinCells; i++) {
      if (i === winnerIdx) {
        out.push({ key: `w${stageIdx}-${i}`, name: winner.username, win: true });
        continue;
      }
      if (bi >= bag.length) {
        bag = shuffle(pool);
        bi = 0;
      }
      out.push({ key: `c${stageIdx}-${i}`, name: bag[bi++], win: false });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx, names, speedTier]);

  const winnerIdx = cells.length ? cells.length - 5 : 0;

  // Static (historical) reveal: snap the ribbon onto the landed winner, no animation.
  useLayoutEffect(() => {
    if (autoPlay) return;
    const strip = stripRef.current;
    if (!strip || !width || !cells.length) return;
    strip.style.transition = 'none';
    strip.style.transform = `translateX(${width / 2 - (winnerIdx * CELL_W + CELL_W / 2)}px)`;
  }, [autoPlay, width, cells, winnerIdx]);

  // Drive one spin per stage: snap to start, then transition to the landing offset.
  useEffect(() => {
    if (!autoPlay || !width || stage >= winners.length || !cells.length) return;
    const strip = stripRef.current;
    if (!strip) return;
    setSpinning(true);
    const final = width / 2 - (winnerIdx * CELL_W + CELL_W / 2);
    const duration = Math.min(6, 3 + speedTier * 0.35);

    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0px)';
    // Force reflow so the browser registers the start before we animate.
    void strip.offsetWidth;
    const raf = requestAnimationFrame(() => {
      strip.style.transition = `transform ${duration}s cubic-bezier(0.33, 0, 0.15, 1)`;
      strip.style.transform = `translateX(${final}px)`;
    });

    const onEnd = () => {
      setSpinning(false);
      setRevealed((r) => (r.find((x) => x.rank === winners[stage].rank) ? r : [...r, winners[stage]]));
      const next = window.setTimeout(() => setStage((s) => s + 1), 850);
      timers.current.push(next);
    };
    strip.addEventListener('transitionend', onEnd, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      strip.removeEventListener('transitionend', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, width, cells]);

  useEffect(() => () => timers.current.forEach((id) => clearTimeout(id)), []);

  const done = stage >= winners.length;

  return (
    <div className="card overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-center gap-2 text-center font-bold">
        <Trophy size={18} className="text-sun" />
        {done ? t('raffles.winnersTitle') : t('raffles.drawing')}
      </div>

      {/* Reel */}
      <div ref={wrapRef} className="relative h-20 overflow-hidden rounded-2xl bg-black/40">
        {/* fixed centre pointer */}
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
          <div className="h-0 w-0 border-x-8 border-t-[10px] border-x-transparent border-t-bubble" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-[2px] -translate-x-1/2 bg-bubble/50" />
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black/70 to-transparent" />

        <div ref={stripRef} className="flex h-full items-center will-change-transform">
          {cells.map((c) => (
            <div
              key={c.key}
              style={{ width: CELL_W }}
              className="flex h-14 shrink-0 items-center justify-center px-1.5"
            >
              <div
                className={`flex h-full w-full items-center justify-center rounded-xl px-2 text-center text-sm font-semibold transition ${
                  c.win && done
                    ? 'bg-bubble/25 text-bubble shadow-glow-pink ring-2 ring-bubble'
                    : 'bg-white/5 text-white/70'
                }`}
              >
                <span className="truncate">{c.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!done && <div className="mt-2 text-center text-xs text-white/40">{t('raffles.drawingSub')}</div>}

      {/* Winners list, revealed as each spin lands — every winner highlighted in pink. */}
      {revealed.length > 0 && (
        <div className="mx-auto mt-4 max-w-md space-y-2">
          {revealed
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((w) => (
              <div
                key={w.rank}
                className="flex animate-fadeup items-center justify-between rounded-xl bg-bubble/15 px-4 py-3 ring-1 ring-bubble/40"
              >
                <span className="flex items-center gap-2 font-bold">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-bubble/25 text-xs text-bubble">
                    {w.rank}
                  </span>
                  {w.username}
                </span>
                <span className="font-extrabold text-bubble">
                  +{fmt(w.prize)} {currency}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
