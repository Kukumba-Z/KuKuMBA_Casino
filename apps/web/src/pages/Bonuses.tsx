import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { BONUS_TABS } from '../lib/nav';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import Cashback from './Cashback';
import Promo from './Promo';
import Referrals from './Referrals';
import Vip from './Vip';

const AUTH_TABS = new Set(['cashback', 'promo', 'referrals']);

export default function Bonuses() {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'bonuses';

  const setTab = (key: string) => setParams(key === 'bonuses' ? {} : { tab: key }, { replace: true });

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <Gift size={24} className="text-lav" /> {t('nav.bonuses')}
      </h1>

      {/* tabs */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {BONUS_TABS.map((b) => {
          const Icon = b.icon;
          const active = tab === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setTab(b.key)}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                active ? 'border-lav/40 bg-lav/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'
              }`}
            >
              <Icon size={16} /> {t(`nav.${b.key}`)}
            </button>
          );
        })}
      </div>

      {/* panel */}
      {AUTH_TABS.has(tab) && !authed ? (
        <SignInCta />
      ) : (
        <>
          {tab === 'bonuses' && <BonusCatalog />}
          {tab === 'cashback' && <Cashback embedded />}
          {tab === 'promo' && <Promo embedded />}
          {tab === 'vip' && <Vip embedded />}
          {tab === 'referrals' && <Referrals embedded />}
        </>
      )}
    </div>
  );
}

function SignInCta() {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <Lock size={28} className="text-white/40" />
      <p className="text-white/60">{t('roulette.needLogin')}</p>
      <Link to="/login" className="btn-primary">{t('common.login')}</Link>
    </div>
  );
}

function BonusCatalog() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const en = i18n.language?.startsWith('en');
  const { data: catalog } = useQuery({ queryKey: ['bonuses'], queryFn: async () => (await api.get('/bonuses')).data });
  const { data: mine } = useQuery({ queryKey: ['my-bonuses'], enabled: authed, queryFn: async () => (await api.get('/bonuses/me')).data });
  const claimedIds = new Set((mine ?? []).map((m: any) => m.bonusId));

  const claim = async (key: string, name: string) => {
    try {
      await api.post(`/bonuses/${key}/claim`);
      toast.success(`${name}: ${t('common.done')}`);
      qc.invalidateQueries({ queryKey: ['balances'] });
      qc.invalidateQueries({ queryKey: ['my-bonuses'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {(catalog ?? []).map((b: any) => (
          <div key={b.id} className="card flex flex-col p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-bold">{b.name}</span>
              <span className="chip">{enumLabel('bonusType', b.type)}</span>
            </div>
            <p className="flex-1 text-sm text-white/55">{en ? b.descriptionEn : b.descriptionRu}</p>
            <div className="mt-3 text-sm text-white/70">
              {b.percent ? `${b.percent}%` : `${fmt(b.amount)} ${b.currency}`}
              {b.wagerMultiplier ? ` · wager x${b.wagerMultiplier}` : ''}
            </div>
            {['WELCOME', 'NO_DEPOSIT'].includes(b.type) ? (
              claimedIds.has(b.id) ? (
                <div className="mt-3 text-center text-xs font-semibold text-mint">{t('bonuses.claimed')}</div>
              ) : authed ? (
                <button onClick={() => claim(b.key, b.name)} className="btn-primary mt-3">{t('common.claim')}</button>
              ) : (
                <Link to="/login" className="btn-ghost mt-3 text-center">{t('common.login')}</Link>
              )
            ) : (
              <div className="mt-3 text-center text-xs text-white/40">{t('bonuses.autoApplied')}</div>
            )}
          </div>
        ))}
        {(!catalog || catalog.length === 0) && <div className="text-white/40">{t('common.empty')}</div>}
      </div>

      {authed && mine && mine.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold">{t('bonuses.mine')}</h2>
          <div className="space-y-2">
            {mine.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                <span>{m.name}</span>
                <span className="tabular-nums">{fmt(m.amount)} {m.currency} · {enumLabel('bonusStatus', m.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
