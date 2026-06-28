import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IdCard, Link2, Lock, Plus, ShieldAlert, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mascot } from '../components/Mascot';
import api, { apiError } from '../lib/api';
import { useMe } from '../lib/hooks';
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
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-holo-soft text-night shadow-glow">
          <Mascot size={52} />
        </span>
        <div className="flex-1">
          <div className="text-2xl font-extrabold">{me?.username}</div>
          <div className="text-sm text-white/50">{me?.email}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="chip">{t('common.accountId')} #{me?.accountId}</span>
            <span className="chip">VIP {me?.vip?.level} · {me?.vip?.name}</span>
            <span className="chip">KYC: {enumLabel('kycStatus', me?.kycStatus)}</span>
            <span className="chip">{t('profile.betsLabel')}: {me?.stats?.bets ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Security />
        <Kyc />
        <Limits />
        <Linked />
      </div>
    </div>
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
      <div className="chip mb-1">{t('profile.statusLabel')}: {enumLabel('kycStatus', data?.status ?? 'NONE')}</div>
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
