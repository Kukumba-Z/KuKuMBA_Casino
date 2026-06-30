import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, History, IdCard, Link2, Lock, Plus, ShieldAlert, UserCog, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOriginal } from '../components/GameCard';
import { HistoryRow } from '../components/HistoryRow';
import { Mascot } from '../components/Mascot';
import { StatusChip } from '../components/StatusChip';
import api, { apiError } from '../lib/api';
import { AVATAR_PRESETS, avatarBg, avatarPresetKey } from '../lib/avatar';
import { useGames, useMe } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

export default function Profile() {
  const { t } = useTranslation();
  const { data: me } = useMe();

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <Mascot size={28} /> {t('profile.title')}
      </h1>

      {/* identity */}
      <div className="card flex flex-wrap items-center gap-6 p-6">
        <span className={`grid h-20 w-20 place-items-center rounded-3xl text-night shadow-glow ${avatarBg(me?.avatarUrl)}`}>
          <Mascot size={52} />
        </span>
        <div className="flex-1">
          <div className="text-2xl font-extrabold">{me?.username}</div>
          <div className="text-sm text-white/50">{me?.email}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">{t('common.accountId')} #{me?.accountId}</span>
            <span className="chip">VIP {me?.vip?.level} · {me?.vip?.name}</span>
            <StatusChip category="kycStatus" value={me?.kycStatus} prefix="KYC" />
            <span className="chip">{t('profile.betsLabel')}: {me?.stats?.bets ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Account />
        <Security />
        <Kyc />
        <Limits />
        <Linked />
      </div>

      <GameHistory />
    </div>
  );
}

/** The player's own game history (KuKuMBA Originals), filterable by game, up to
 *  1000 rounds, loaded a page at a time. */
function GameHistory() {
  const { t } = useTranslation();
  const { data: games } = useGames();
  const originGames = useMemo(() => (games ?? []).filter(isOriginal), [games]);
  const [game, setGame] = useState('');

  const q = useInfiniteQuery({
    queryKey: ['my-history', game],
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (game) params.set('game', game);
      if (pageParam) params.set('cursor', pageParam as string);
      return (await api.get(`/users/me/history?${params.toString()}`)).data as { items: any[]; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = (q.data?.pages ?? []).flatMap((p) => p.items);

  return (
    <Section title={t('profile.history')} icon={History}>
      {originGames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip active={game === ''} onClick={() => setGame('')} label={t('top.all')} />
          {originGames.map((g) => (
            <Chip key={g.key} active={game === g.key} onClick={() => setGame(g.key)} label={g.name} />
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-white/40">{t('common.empty')}</div>
      ) : (
        <>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <HistoryRow key={r.roundId} f={r} />
            ))}
          </div>
          {q.hasNextPage && (
            <button
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-lav transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              {t('profile.loadMore')}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'border-mint/40 bg-mint/15 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
      }`}
    >
      {label}
    </button>
  );
}

function Account() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);

  // Seed local fields once the profile loads (and after a save invalidates it).
  useEffect(() => {
    if (me) {
      setUsername(me.username ?? '');
      setEmail(me.email ?? '');
      setAvatar(me.avatarUrl ?? null);
    }
  }, [me?.username, me?.email, me?.avatarUrl]);

  const save = async (patch: Record<string, string>, ok = t('profile.saved')) => {
    try {
      await api.patch('/users/me', patch);
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(ok);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, string> = {};
    if (username && username !== me?.username) patch.username = username;
    if (email && email !== me?.email) patch.email = email;
    if (Object.keys(patch).length === 0) return;
    save(patch);
  };

  const pickAvatar = (key: string) => {
    const token = `preset:${key}`;
    setAvatar(token);
    save({ avatarUrl: token });
  };

  const currentKey = avatarPresetKey(avatar);
  const emailChanged = !!email && email !== me?.email;

  return (
    <Section title={t('profile.account')} icon={UserCog}>
      <form onSubmit={submit} className="space-y-2">
        <label className="block text-xs text-white/50">{t('profile.username')}</label>
        <input className="input" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value)} />
        <label className="block text-xs text-white/50">{t('profile.email')}</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {emailChanged && <p className="text-xs text-sun/80">{t('profile.emailNote')}</p>}
        <button className="btn-soft w-full">{t('common.save')}</button>
      </form>
      <div>
        <div className="mb-1.5 text-xs text-white/50">{t('profile.avatar')}</div>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pickAvatar(p.key)}
              aria-label={p.key}
              className={`grid h-11 w-11 place-items-center rounded-2xl ${p.class} ring-2 transition ${
                currentKey === p.key ? 'shadow-glow ring-white' : 'ring-transparent hover:ring-white/40'
              }`}
            >
              {currentKey === p.key && <Check size={16} className="text-night" />}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: any }) {
  return (
    <div className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Icon size={18} className="text-lav" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Security() {
  const { t } = useTranslation();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const clear = useAuth((s) => s.clear);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/me/password', { oldPassword, newPassword });
      toast.success(t('profile.passwordChanged'));
      setTimeout(() => clear(), 1200);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <Section title={t('profile.security')} icon={Lock}>
      <form onSubmit={submit} className="space-y-2">
        <input className="input" type="password" placeholder={t('profile.oldPassword')} value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        <input className="input" type="password" placeholder={t('profile.newPassword')} value={newPassword} onChange={(e) => setNew(e.target.value)} />
        <button className="btn-soft w-full">{t('profile.changePassword')}</button>
      </form>
    </Section>
  );
}

function Kyc() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['kyc'], queryFn: async () => (await api.get('/kyc')).data });
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [dob, setDob] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/kyc/submit', { fullName, country, dateOfBirth: dob || undefined });
      toast.success(t('profile.kycSubmitted'));
      qc.invalidateQueries({ queryKey: ['kyc'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Section title={t('profile.kyc')} icon={IdCard}>
      <div className="mb-1"><StatusChip category="kycStatus" value={data?.status ?? 'NONE'} prefix={t('profile.statusLabel')} /></div>
      {data?.status !== 'VERIFIED' && (
        <form onSubmit={submit} className="space-y-2">
          <input className="input" placeholder={t('profile.fullName')} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder={t('profile.country')} value={country} onChange={(e) => setCountry(e.target.value)} />
            <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <button className="btn-soft w-full">{t('profile.kycSubmit')}</button>
        </form>
      )}
    </Section>
  );
}

function Limits() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['rg'], queryFn: async () => (await api.get('/responsible-gaming/limits')).data });
  const [type, setType] = useState('DEPOSIT');
  const [period, setPeriod] = useState('DAILY');
  const [amount, setAmount] = useState('');

  const setLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/responsible-gaming/limits', { type, period, amount });
      toast.success(t('profile.limitSaved'));
      qc.invalidateQueries({ queryKey: ['rg'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const exclude = async () => {
    if (!confirm(t('profile.selfExcludeConfirm'))) return;
    try {
      await api.post('/responsible-gaming/self-exclude', { until: new Date(Date.now() + 864e5).toISOString() });
      useAuth.getState().clear();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Section title={t('profile.limits')} icon={ShieldAlert}>
      <form onSubmit={setLimit} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="DEPOSIT">{t('profile.limitDeposit')}</option>
            <option value="LOSS">{t('profile.limitLoss')}</option>
            <option value="WAGER">{t('profile.limitWager')}</option>
          </select>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="DAILY">{t('profile.periodDaily')}</option>
            <option value="WEEKLY">{t('profile.periodWeekly')}</option>
            <option value="MONTHLY">{t('profile.periodMonthly')}</option>
          </select>
          <input className="input" placeholder={t('common.amount')} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn-soft w-full">{t('common.save')}</button>
      </form>
      <div className="space-y-1 text-sm text-white/60">
        {(data ?? []).map((l: any) => (
          <div key={l.id} className="flex justify-between">
            <span>{enumLabel('rgLimitType', l.type)} · {enumLabel('rgPeriod', l.period)}</span>
            <span>{l.amount}</span>
          </div>
        ))}
      </div>
      <button onClick={exclude} className="btn-ghost w-full text-roul-red">{t('profile.selfExclude')}</button>
    </Section>
  );
}

function Linked() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const link = async (provider: string) => {
    try {
      await api.post('/users/me/linked', { provider, providerUserId: `${provider}_${Date.now()}`, displayName: provider });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const unlink = async (id: string) => {
    try {
      await api.delete(`/users/me/linked/${id}`);
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <Section title={t('profile.linked')} icon={Link2}>
      <div className="space-y-2">
        {(me?.linkedAccounts ?? []).map((l: any) => (
          <div key={l.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <span className="capitalize">{l.provider}</span>
            <button onClick={() => unlink(l.id)} className="grid place-items-center text-roul-red" aria-label={t('common.cancel')}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {['google', 'telegram'].map((p) => (
          <button key={p} onClick={() => link(p)} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 text-sm capitalize">
            <Plus size={15} /> {p}
          </button>
        ))}
      </div>
    </Section>
  );
}
