import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, BadgePercent, Check, Coins, Repeat, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VipEmblem } from '../components/VipEmblem';
import api from '../lib/api';
import { fmt, useVipLevels, type VipLevelInfo } from '../lib/hooks';
import { useAuth } from '../store/auth';

/** One track of the dual progression (deposits / wagers) with a gradient bar. */
function ProgressTrack({
  icon: Icon,
  label,
  have,
  need,
  progress,
  gradient,
}: {
  icon: typeof Coins;
  label: string;
  have: string;
  need: string;
  progress: number;
  gradient: string;
}) {
  const pct = Math.round(progress * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-white/60">
          <Icon size={13} /> {label}
        </span>
        <span className="tabular-nums text-white/70">
          <b className="text-white">${fmt(have, 2)}</b> / ${fmt(need, 2)} · {pct}%
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-black/40 shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-700`}
          style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** Big round emblem of a VIP rank, glowing in the rank's colour. */
function Emblem({ level, size = 'lg' }: { level?: VipLevelInfo | null; size?: 'lg' | 'sm' }) {
  if (!level) return null;
  const cls = size === 'lg' ? 'h-20 w-20' : 'h-10 w-10';
  const color = level.color ?? '#9AA4C7';
  return (
    <span
      className={`grid ${cls} shrink-0 place-items-center rounded-full border bg-black/30`}
      style={{ borderColor: `${color}66`, boxShadow: `0 0 28px -6px ${color}` }}
      title={level.name}
    >
      <VipEmblem icon={level.icon} color={color} size={size === 'lg' ? 42 : 21} />
    </span>
  );
}

export default function Vip({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const authed = !!useAuth((s) => s.accessToken);
  const { data: levels } = useVipLevels();
  const { data: status } = useQuery({
    queryKey: ['vip-status'],
    enabled: authed,
    queryFn: async () => (await api.get('/vip/status')).data,
  });

  return (
    <div className="space-y-6">
      {!embedded && (
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Sparkles size={24} className="text-sun" /> {t('vip.title')}
        </h1>
      )}

      {authed && status && (
        <div className="card p-6">
          <div className="flex flex-wrap items-center gap-5">
            <Emblem level={status.current} />
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase text-white/40">{t('vip.level')} {status.level}</div>
              <div className="holo-text truncate text-3xl font-extrabold">{status.current?.name}</div>
            </div>
            <div className="text-right text-sm text-white/60">
              <div className="flex items-center justify-end gap-1.5">
                <BadgePercent size={14} className="text-mint" /> {t('vip.cashback')}:{' '}
                <b className="text-mint">{status.current?.cashbackPercent}%</b>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <Repeat size={14} className="text-sky" /> {t('vip.rakeback')}:{' '}
                <b className="text-sky">{status.current?.rakebackPercent}%</b>
              </div>
            </div>
          </div>

          {status.next ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>{t('vip.progressTo')}</span>
                <span className="flex items-center gap-1.5 font-semibold text-white/80">
                  <VipEmblem icon={status.next.icon} color={status.next.color} size={14} />
                  {status.next.name} · {t('vip.level')} {status.next.level}
                </span>
              </div>
              <ProgressTrack
                icon={ArrowDownToLine}
                label={t('vip.depositsTrack')}
                have={status.depositedUsd}
                need={status.next.depositRequiredUsd}
                progress={status.progress?.deposit ?? 0}
                gradient="from-mint to-sky"
              />
              <ProgressTrack
                icon={Coins}
                label={t('vip.wagersTrack')}
                have={status.wageredUsd}
                need={status.next.wagerRequiredUsd}
                progress={status.progress?.wager ?? 0}
                gradient="from-lav to-bubble"
              />
              <p className="text-xs text-white/40">{t('vip.bothNote')}</p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-white/[0.04] px-4 py-3 text-center text-sm text-sun">
              {t('vip.maxLevel')}
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-white/45">{t('vip.howItWorks')}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(levels ?? []).map((l) => {
          const isCurrent = status?.level === l.level;
          const achieved = status != null && status.level > l.level;
          return (
            <div
              key={l.level}
              className={`card p-5 ${achieved ? 'opacity-70' : ''}`}
              style={{
                boxShadow: isCurrent ? `0 0 40px -12px ${l.color}` : undefined,
                borderColor: isCurrent ? `${l.color}55` : undefined,
              }}
            >
              <div className="mb-3 flex items-center gap-3">
                <Emblem level={l} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold" style={{ color: l.color ?? undefined }}>{l.name}</div>
                  <div className="text-xs text-white/40">{t('vip.level')} {l.level}</div>
                </div>
                {isCurrent && <span className="chip text-mint">{t('vip.you')}</span>}
                {achieved && <Check size={16} className="text-mint/70" />}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>{t('vip.depositsTrack')}</span>
                  <span className="tabular-nums text-white/85">${fmt(l.depositRequiredUsd, 0)}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>{t('vip.wagersTrack')}</span>
                  <span className="tabular-nums text-white/85">${fmt(l.wagerRequiredUsd, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">{t('vip.cashback')}</span>
                  <span className="font-semibold text-mint">{l.cashbackPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">{t('vip.rakeback')}</span>
                  <span className="font-semibold text-sky">{l.rakebackPercent}%</span>
                </div>
                {(en ? l.perksEn : l.perksRu) && (
                  <div className="pt-1 text-xs text-sun/80">{en ? l.perksEn : l.perksRu}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
