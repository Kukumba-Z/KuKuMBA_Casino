import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../../lib/api';
import { can, fmt, type AdminMe } from '../../../../lib/hooks';
import { enumLabel } from '../../../../lib/labels';
import { toast } from '../../../../store/toast';
import { CurrencySelect } from '../../shared/CurrencySelect';
import { BetsPanel } from './BetsPanel';
import { GrantBonusPanel } from './GrantBonusPanel';

const ALL_ROLES = ['USER', 'PARTNER', 'SUPPORT', 'MODERATOR', 'ADMIN'];

export function UserDetail({ user, me, refresh }: { user: any; me: AdminMe; refresh: () => void }) {
  const { t } = useTranslation();
  const id = user.id;
  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState('DEMO');
  const [mode, setMode] = useState<'DEMO' | 'REAL'>('DEMO');
  const [allowNegative, setAllowNegative] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [email, setEmail] = useState(user.email ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [notif, setNotif] = useState({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '' });

  const { data: sessions } = useQuery({
    queryKey: ['adm-user-sessions', id],
    enabled: can(me, 'users.edit'),
    queryFn: async () => (await api.get(`/admin/users/${id}/sessions`)).data,
  });

  const act = async (fn: () => Promise<any>, ok?: string) => {
    try {
      await fn();
      refresh();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(apiError(e));
      return false;
    }
  };
  const muted = user.chatMutedUntil && new Date(user.chatMutedUntil) > new Date();

  return (
    <div className="card space-y-3 p-4">
      <div className="font-bold">
        {user.username} · #{user.accountId} <span className="chip ml-1 text-xs">{enumLabel('role', user.role)}</span>
      </div>
      <div className="text-sm text-white/50">
        {user.email}{user.emailVerified ? ' ✓' : ` (${t('admin.users.unverified')})`} · VIP {user.vipLevel} ·
        KYC: {enumLabel('kycStatus', user.kycStatus)} · {enumLabel('userStatus', user.status)}
        {muted && <span className="ml-1 text-roul-red">· {t('admin.chat.muted')}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {(user.balances ?? []).map((b: any) => (
          <span key={b.currency + b.mode} className="chip">{fmt(b.amount, 4)} {b.currency} ({enumLabel('mode', b.mode)})</span>
        ))}
      </div>

      {can(me, 'users.balance') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">{t('admin.users.balanceAdj')}</div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('admin.common.amount')} />
            <CurrencySelect
              className="input"
              value={currency}
              onChange={(code, cur) => {
                setCurrency(code);
                // Wallet mode follows the currency kind (demo coins ⇔ DEMO wallet).
                if (cur) setMode(cur.type === 'DEMO' ? 'DEMO' : 'REAL');
              }}
            />
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}>
              <option value="DEMO">{enumLabel('mode', 'DEMO')}</option>
              <option value="REAL">{enumLabel('mode', 'REAL')}</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
            {t('admin.users.allowNegative')}
          </label>
          <button
            onClick={() => act(() => api.post('/admin/balance/adjust', { userId: id, currency, mode, amount, allowNegative }), t('admin.users.balanceUpdated'))}
            className="btn-soft w-full text-sm"
          >
            {t('admin.common.apply')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {can(me, 'kyc.review') && (
          <>
            <button onClick={() => act(() => api.post(`/admin/users/${id}/kyc`, { approve: true }), t('admin.users.kycApproved'))} className="btn-ghost inline-flex items-center gap-1 text-sm text-mint"><Check size={14} /> KYC</button>
            <button onClick={() => act(() => api.post(`/admin/users/${id}/kyc`, { approve: false, note: 'rejected' }), t('admin.users.kycRejected'))} className="btn-ghost inline-flex items-center gap-1 text-sm"><X size={14} /> KYC</button>
          </>
        )}
        {can(me, 'users.vip') && (
          <button onClick={() => act(() => api.post(`/admin/users/${id}/vip`, { level: (user.vipLevel ?? 0) + 1 }), 'VIP +1')} className="btn-ghost text-sm">VIP +1</button>
        )}
        {can(me, 'chat.moderate') && (
          muted ? (
            <button onClick={() => act(() => api.post(`/admin/users/${id}/mute`, { minutes: 0 }), t('admin.chat.unmuted'))} className="btn-ghost text-sm text-mint">{t('admin.chat.unmute')}</button>
          ) : (
            <button onClick={() => act(() => api.post(`/admin/users/${id}/mute`, { minutes: 60 }), t('admin.chat.muted60'))} className="btn-ghost text-sm">{t('admin.chat.mute60')}</button>
          )
        )}
        {can(me, 'users.role') && (
          <label className="inline-flex items-center gap-1.5 text-sm text-white/50">
            {t('admin.users.role')}
            <select className="input !py-1.5 !w-36" value={user.role} onChange={(e) => act(() => api.post(`/admin/users/${id}/role`, { role: e.target.value }), `${t('admin.users.role')}: ${enumLabel('role', e.target.value)}`)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{enumLabel('role', r)}</option>)}
            </select>
          </label>
        )}
      </div>

      {(can(me, 'users.ban') || can(me, 'bonuses.manage')) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/30 p-3">
          {can(me, 'users.ban') && (
            user.status === 'BANNED' ? (
              <button onClick={() => act(() => api.post(`/admin/users/${id}/status`, { status: 'ACTIVE' }), t('admin.users.unbanned'))} className="btn-ghost text-sm text-mint">{t('admin.users.unban')}</button>
            ) : (
              <>
                <input className="input flex-1 !py-1.5" placeholder={t('admin.users.banReason')} value={banReason} onChange={(e) => setBanReason(e.target.value)} />
                <button onClick={() => act(() => api.post(`/admin/users/${id}/status`, { status: 'BANNED', reason: banReason }), t('admin.users.banned'))} className="btn-ghost text-sm text-roul-red">{t('admin.users.ban')}</button>
              </>
            )
          )}
          {can(me, 'bonuses.manage') && (
            user.bonusAccess === false ? (
              <button onClick={() => act(() => api.post(`/admin/users/${id}/bonus-access`, { allowed: true }), t('admin.users.bonusesUnblocked'))} className="btn-ghost text-sm text-mint">{t('admin.users.unblockBonuses')}</button>
            ) : (
              <button onClick={() => act(() => api.post(`/admin/users/${id}/bonus-access`, { allowed: false }), t('admin.users.bonusesBlocked'))} className="btn-ghost text-sm text-roul-red">{t('admin.users.blockBonuses')}</button>
            )
          )}
        </div>
      )}

      {can(me, 'bonuses.manage') && <GrantBonusPanel id={id} act={act} />}

      {can(me, 'users.edit') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">{t('admin.users.account')}</div>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1 !py-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
            <input className="input flex-1 !py-1.5" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => act(() => api.patch(`/admin/users/${id}`, { email, username }), t('admin.common.saved'))} className="btn-soft text-sm">{t('admin.common.save')}</button>
            <button onClick={() => act(() => api.patch(`/admin/users/${id}`, { emailVerified: true }), t('admin.users.emailVerified'))} className="btn-ghost text-sm">{t('admin.users.verifyEmail')}</button>
            <button
              onClick={() => act(async () => { const { data } = await api.post(`/admin/users/${id}/reset-password`, {}); window.prompt(t('admin.users.newPassword'), data.password); }, t('admin.users.passwordReset'))}
              className="btn-ghost text-sm"
            >{t('admin.users.resetPassword')}</button>
            {sessions && (
              <button onClick={() => act(() => api.post(`/admin/users/${id}/revoke-sessions`, {}), t('admin.users.sessionsRevoked'))} className="btn-ghost text-sm">
                {t('admin.users.revokeSessions')} ({(sessions ?? []).filter((s: any) => s.active).length})
              </button>
            )}
          </div>
        </div>
      )}

      {can(me, 'notifications.send') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">{t('admin.users.sendNotification')}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input !py-1.5" placeholder={t('admin.broadcast.titleRu')} value={notif.titleRu} onChange={(e) => setNotif({ ...notif, titleRu: e.target.value })} />
            <input className="input !py-1.5" placeholder={t('admin.broadcast.titleEn')} value={notif.titleEn} onChange={(e) => setNotif({ ...notif, titleEn: e.target.value })} />
            <input className="input !py-1.5" placeholder={t('admin.broadcast.bodyRu')} value={notif.bodyRu} onChange={(e) => setNotif({ ...notif, bodyRu: e.target.value })} />
            <input className="input !py-1.5" placeholder={t('admin.broadcast.bodyEn')} value={notif.bodyEn} onChange={(e) => setNotif({ ...notif, bodyEn: e.target.value })} />
          </div>
          <button
            onClick={() => act(async () => { await api.post(`/admin/users/${id}/notify`, notif); setNotif({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '' }); }, t('admin.common.sent'))}
            className="btn-soft text-sm" disabled={!notif.titleRu || !notif.titleEn}
          >{t('admin.common.send')}</button>
        </div>
      )}

      <BetsPanel userId={id} me={me} refresh={refresh} />
    </div>
  );
}
