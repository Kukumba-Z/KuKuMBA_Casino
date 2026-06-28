import { RotateCw, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { fmt } from '../lib/hooks';
import { Modal } from './Modal';

/** One bet type as returned by a game's `info` endpoint. */
export interface BetTypeInfo {
  type: string;
  labelRu: string;
  labelEn: string;
  /** gross return per unit stake (includes the stake) */
  multiplier: number;
  /** how many outcomes win this bet (probability numerator) */
  winningCount?: number;
}

export interface Seed {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

/**
 * Shared "info & fairness" dialog for any game. Every section renders only if
 * its data is present, so a slots game without `bets` simply omits that block.
 * Pass the game's `info` (rtp, description, bets), the active currency limits,
 * and the player's provably-fair `seed` (when signed in) + a rotate handler.
 */
export function GameInfoModal({
  open,
  onClose,
  title,
  rtp,
  descriptionRu,
  descriptionEn,
  bets,
  limits,
  currency,
  pockets,
  seed,
  onRotateSeed,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  rtp?: number;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  bets?: BetTypeInfo[];
  limits?: { min: number; max: number };
  currency: string;
  /** total number of outcomes, for the "X / pockets" chance column */
  pockets?: number;
  seed?: Seed | null;
  onRotateSeed?: () => void;
}) {
  const { t } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const description = en ? descriptionEn : descriptionRu;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {rtp != null && (
          <p className="flex items-center gap-1.5 text-sm text-white/60">
            <ShieldCheck size={15} className="text-mint" /> RTP {(rtp * 100).toFixed(1)}% · provably-fair
          </p>
        )}

        {description && <p className="text-sm text-white/50">{description}</p>}

        {limits && (
          <div className="rounded-xl bg-black/30 p-3 text-sm text-white/60">
            {t('game.limits')}:{' '}
            <b className="text-white/80">
              {fmt(limits.min, 2)}–{fmt(limits.max, 2)} {currency}
            </b>
          </div>
        )}

        {bets && bets.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold">{t('game.bets')}</h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
                <span>{t('game.bet')}</span>
                <span className="text-right">{t('game.chance')}</span>
                <span className="text-right">{t('game.payout')}</span>
              </div>
              {bets.map((b) => (
                <div
                  key={b.type}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-white/5 px-3 py-2 text-sm"
                >
                  <span className="text-white/80">{en ? b.labelEn : b.labelRu}</span>
                  <span className="text-right tabular-nums text-white/40">
                    {b.winningCount != null ? `${b.winningCount}${pockets ? `/${pockets}` : ''}` : '—'}
                  </span>
                  <span className="text-right font-bold tabular-nums">×{b.multiplier.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck size={16} className="text-mint" /> {t('game.fairness')}
          </h3>
          {seed ? (
            <>
              <SeedField label={t('game.serverHash')} value={seed.serverSeedHash} mono />
              <SeedField label={t('game.clientSeed')} value={seed.clientSeed} mono />
              <SeedField label={t('game.nonce')} value={String(seed.nonce)} />
              {onRotateSeed && (
                <button onClick={onRotateSeed} className="btn-soft inline-flex items-center gap-1.5 text-sm">
                  <RotateCw size={15} /> {t('game.rotate')}
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-white/40">{t('game.signInSeeds')}</p>
          )}
          <p className="text-xs text-white/40">{t('game.pfHint')}</p>
        </div>
      </div>
    </Modal>
  );
}

function SeedField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-black/30 p-3">
      <div className="mb-1 text-xs text-white/40">{label}</div>
      <div className={`truncate text-sm ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  );
}
