import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Coins,
  FileText,
  Gamepad2,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessagesSquare,
  PartyPopper,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Tag,
  Users as UsersIcon,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import api, { apiError } from '../lib/api';
import { can, fmt, useAdminMe, useCurrencies, type AdminMe } from '../lib/hooks';
import { enumLabel } from '../lib/labels';
import { toast } from '../store/toast';

// Each tab declares the permission that unlocks it (ADMIN sees all).
const TABS: { key: string; label: string; icon: LucideIcon; perm: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
  { key: 'users', label: 'Users', icon: UsersIcon, perm: 'users.view' },
  { key: 'roles', label: 'Roles', icon: Shield, perm: 'roles.manage' },
  { key: 'deposits', label: 'Deposits', icon: ArrowDownToLine, perm: 'deposits.manage' },
  { key: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, perm: 'withdrawals.manage' },
  { key: 'promo', label: 'Promo', icon: Tag, perm: 'promo.manage' },
  { key: 'games', label: 'Games', icon: Gamepad2, perm: 'games.manage' },
  { key: 'bonuses', label: 'Bonuses', icon: Gift, perm: 'bonuses.manage' },
  { key: 'raffles', label: 'Raffles', icon: PartyPopper, perm: 'raffles.manage' },
  { key: 'currencies', label: 'Currencies', icon: Coins, perm: 'currencies.manage' },
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone, perm: 'notifications.send' },
  { key: 'tickets', label: 'Tickets', icon: LifeBuoy, perm: 'tickets.manage' },
  { key: 'chat', label: 'Chat', icon: MessagesSquare, perm: 'chat.moderate' },
  { key: 'transactions', label: 'Transactions', icon: Receipt, perm: 'transactions.view' },
  { key: 'content', label: 'Content', icon: FileText, perm: 'content.manage' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, perm: 'settings.manage' },
  { key: 'audit', label: 'Audit', icon: ScrollText, perm: 'audit.view' },
];

export default function AdminPage() {
  const { data: me } = useAdminMe();
  const visible = useMemo(() => TABS.filter((t) => can(me, t.perm)), [me]);
  const [tab, setTab] = useState('dashboard');
  // Fall back to the first tab the operator can actually see.
  const active = visible.some((t) => t.key === tab) ? tab : visible[0]?.key;

  if (!me) return <div className="card p-6 text-center text-white/50">{i18n.t('common.loading')}</div>;
  if (visible.length === 0)
    return <div className="card p-6 text-center text-white/50">No permissions assigned to your role yet.</div>;

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <ShieldCheck size={24} className="text-lav" /> Admin · KuKuMBA
        <span className="chip ml-1 text-xs">{me.role}</span>
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition ${active === key ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {active === 'dashboard' && <Dashboard />}
      {active === 'users' && <Users me={me} />}
      {active === 'roles' && <Roles />}
      {active === 'games' && <GamesAdmin />}
      {active === 'deposits' && <Deposits />}
      {active === 'withdrawals' && <Withdrawals />}
      {active === 'promo' && <Promo />}
      {active === 'bonuses' && <Bonuses />}
      {active === 'raffles' && <RafflesAdmin />}
      {active === 'currencies' && <Currencies />}
      {active === 'broadcast' && <Broadcast />}
      {active === 'tickets' && <Tickets />}
      {active === 'chat' && <ChatAdmin />}
      {active === 'transactions' && <Transactions />}
      {active === 'content' && <Content />}
      {active === 'settings' && <Settings />}
      {active === 'audit' && <Audit />}
    </div>
  );
}

function Dashboard() {
  const { data } = useQuery({ queryKey: ['adm-dash'], queryFn: async () => (await api.get('/admin/dashboard')).data });
  const items = [
    ['Users', data?.users],
    ['Pending deposits', data?.pendingDeposits],
    ['Pending withdrawals', data?.pendingWithdrawals],
    ['Open raffles', data?.openRaffles],
    ['Open tickets', data?.openTickets],
    ['Rounds', data?.rounds],
    ['KYC pending', data?.kycPending],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([l, v]) => (
        <div key={l as string} className="stat">
          <div className="text-xs uppercase text-white/40">{l}</div>
          <div className="text-2xl font-extrabold">{v ?? 0}</div>
        </div>
      ))}
    </div>
  );
}

const ALL_ROLES = ['USER', 'PARTNER', 'SUPPORT', 'MODERATOR', 'ADMIN'];

function Users({ me }: { me: AdminMe }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['adm-users', q], queryFn: async () => (await api.get(`/admin/users?q=${encodeURIComponent(q)}`)).data });
  const { data: user } = useQuery({ queryKey: ['adm-user', sel], enabled: !!sel, queryFn: async () => (await api.get(`/admin/users/${sel}`)).data });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['adm-user', sel] });
    qc.invalidateQueries({ queryKey: ['adm-users', q] });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <input className="input mb-3" placeholder="Search (name / email / ID)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {(data?.items ?? []).map((u: any) => (
            <button key={u.id} onClick={() => setSel(u.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${sel === u.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <span>{u.username} <span className="text-white/40">#{u.accountId}</span></span>
              <span className="chip">{u.role} · {u.status}</span>
            </button>
          ))}
          {(data?.items ?? []).length === 0 && <div className="py-3 text-center text-white/40">—</div>}
        </div>
      </div>

      {user && <UserDetail key={user.id} user={user} me={me} refresh={refresh} />}
    </div>
  );
}

function UserDetail({ user, me, refresh }: { user: any; me: AdminMe; refresh: () => void }) {
  const id = user.id;
  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState('DEMO');
  const [mode, setMode] = useState('DEMO');
  const [banReason, setBanReason] = useState('');
  const [email, setEmail] = useState(user.email ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [notif, setNotif] = useState({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '' });
  const [showBets, setShowBets] = useState(false);

  const { data: bets } = useQuery({ queryKey: ['adm-user-bets', id], enabled: showBets, queryFn: async () => (await api.get(`/admin/users/${id}/bets?take=25`)).data });
  const { data: sessions } = useQuery({ queryKey: ['adm-user-sessions', id], enabled: can(me, 'users.edit'), queryFn: async () => (await api.get(`/admin/users/${id}/sessions`)).data });

  const act = async (fn: () => Promise<any>, ok = 'Done') => {
    try { await fn(); refresh(); toast.success(ok); } catch (e) { toast.error(apiError(e)); }
  };
  const muted = user.chatMutedUntil && new Date(user.chatMutedUntil) > new Date();

  return (
    <div className="card space-y-3 p-4">
      <div className="font-bold">{user.username} · #{user.accountId} <span className="chip ml-1 text-xs">{user.role}</span></div>
      <div className="text-sm text-white/50">
        {user.email}{user.emailVerified ? ' ✓' : ' (unverified)'} · VIP {user.vipLevel} · KYC {user.kycStatus} · {user.status}
        {muted && <span className="ml-1 text-roul-red">· muted</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 text-sm">
        {(user.balances ?? []).map((b: any) => (
          <span key={b.currency + b.mode} className="chip">{fmt(b.amount, 4)} {b.currency} ({b.mode})</span>
        ))}
      </div>

      {can(me, 'users.balance') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">Balance adjustment</div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option>DEMO</option>
              <option>REAL</option>
            </select>
          </div>
          <button onClick={() => act(() => api.post('/admin/balance/adjust', { userId: id, currency, mode, amount }), 'Balance updated')} className="btn-soft w-full text-sm">Apply</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {can(me, 'kyc.review') && (
          <>
            <button onClick={() => act(() => api.post(`/admin/users/${id}/kyc`, { approve: true }), 'KYC approved')} className="btn-ghost inline-flex items-center gap-1 text-sm text-mint"><Check size={14} /> KYC</button>
            <button onClick={() => act(() => api.post(`/admin/users/${id}/kyc`, { approve: false, note: 'rejected' }), 'KYC rejected')} className="btn-ghost inline-flex items-center gap-1 text-sm"><X size={14} /> KYC</button>
          </>
        )}
        {can(me, 'users.vip') && (
          <button onClick={() => act(() => api.post(`/admin/users/${id}/vip`, { level: (user.vipLevel ?? 0) + 1 }), 'VIP +1')} className="btn-ghost text-sm">VIP +1</button>
        )}
        {can(me, 'chat.moderate') && (
          muted ? (
            <button onClick={() => act(() => api.post(`/admin/users/${id}/mute`, { minutes: 0 }), 'Unmuted')} className="btn-ghost text-sm text-mint">Unmute</button>
          ) : (
            <button onClick={() => act(() => api.post(`/admin/users/${id}/mute`, { minutes: 60 }), 'Muted 60m')} className="btn-ghost text-sm">Mute 60m</button>
          )
        )}
        {can(me, 'users.role') && (
          <label className="inline-flex items-center gap-1.5 text-sm text-white/50">
            Role
            <select className="input !py-1.5 !w-32" value={user.role} onChange={(e) => act(() => api.post(`/admin/users/${id}/role`, { role: e.target.value }), `Role: ${e.target.value}`)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
      </div>

      {can(me, 'users.ban') && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/30 p-3">
          {user.status === 'BANNED' ? (
            <button onClick={() => act(() => api.post(`/admin/users/${id}/status`, { status: 'ACTIVE' }), 'Unbanned')} className="btn-ghost text-sm text-mint">Unban</button>
          ) : (
            <>
              <input className="input flex-1 !py-1.5" placeholder="Ban reason (optional)" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
              <button onClick={() => act(() => api.post(`/admin/users/${id}/status`, { status: 'BANNED', reason: banReason }), 'Banned')} className="btn-ghost text-sm text-roul-red">Ban</button>
            </>
          )}
        </div>
      )}

      {can(me, 'users.edit') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">Account</div>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1 !py-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
            <input className="input flex-1 !py-1.5" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => act(() => api.patch(`/admin/users/${id}`, { email, username }), 'Saved')} className="btn-soft text-sm">Save</button>
            <button onClick={() => act(() => api.patch(`/admin/users/${id}`, { emailVerified: true }), 'Email verified')} className="btn-ghost text-sm">Verify email</button>
            <button
              onClick={() => act(async () => { const { data } = await api.post(`/admin/users/${id}/reset-password`, {}); window.prompt('New password (copy it):', data.password); }, 'Password reset')}
              className="btn-ghost text-sm"
            >Reset password</button>
            {sessions && (
              <button onClick={() => act(() => api.post(`/admin/users/${id}/revoke-sessions`, {}), 'Sessions revoked')} className="btn-ghost text-sm">
                Revoke sessions ({(sessions ?? []).filter((s: any) => s.active).length})
              </button>
            )}
          </div>
        </div>
      )}

      {can(me, 'notifications.send') && (
        <div className="space-y-2 rounded-xl bg-black/30 p-3">
          <div className="text-xs text-white/40">Send notification</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input !py-1.5" placeholder="Заголовок (RU)" value={notif.titleRu} onChange={(e) => setNotif({ ...notif, titleRu: e.target.value })} />
            <input className="input !py-1.5" placeholder="Title (EN)" value={notif.titleEn} onChange={(e) => setNotif({ ...notif, titleEn: e.target.value })} />
            <input className="input !py-1.5" placeholder="Текст (RU)" value={notif.bodyRu} onChange={(e) => setNotif({ ...notif, bodyRu: e.target.value })} />
            <input className="input !py-1.5" placeholder="Body (EN)" value={notif.bodyEn} onChange={(e) => setNotif({ ...notif, bodyEn: e.target.value })} />
          </div>
          <button
            onClick={() => act(async () => { await api.post(`/admin/users/${id}/notify`, notif); setNotif({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '' }); }, 'Sent')}
            className="btn-soft text-sm" disabled={!notif.titleRu || !notif.titleEn}
          >Send</button>
        </div>
      )}

      <div>
        <button onClick={() => setShowBets((s) => !s)} className="text-sm text-lav hover:underline">{showBets ? 'Hide' : 'Show'} recent bets</button>
        {showBets && (
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs">
            {(bets ?? []).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <span>{b.betType} · {b.outcome}</span>
                <span className={Number(b.payout) > 0 ? 'text-mint' : 'text-white/40'}>{Number(b.payout) > 0 ? `+${fmt(b.payout, 2)}` : `−${fmt(b.stake, 2)}`} {b.currency}</span>
              </div>
            ))}
            {(bets ?? []).length === 0 && <div className="py-2 text-center text-white/30">—</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Deposits() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-deps'], queryFn: async () => (await api.get('/admin/deposits?status=PENDING')).data });
  const confirm = async (id: string) => {
    try {
      await api.post(`/admin/deposits/${id}/confirm`);
      qc.invalidateQueries({ queryKey: ['adm-deps'] });
      toast.success('Deposit confirmed');
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <Table
      rows={data ?? []}
      cols={['user', 'amount', 'status', '']}
      render={(d: any) => [
        `${d.user?.username} #${d.user?.accountId}`,
        `${fmt(d.amount)} ${d.currency} (${d.network ?? '-'})`,
        d.status,
        <button key="c" onClick={() => confirm(d.id)} className="btn-soft text-xs">Confirm</button>,
      ]}
    />
  );
}

function Withdrawals() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-wd'], queryFn: async () => (await api.get('/admin/withdrawals')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ['adm-wd'] });
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); refresh(); toast.success(ok); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Table
      rows={data ?? []}
      cols={['user', 'amount', 'status', '']}
      render={(w: any) => [
        `${w.user?.username} #${w.user?.accountId}`,
        `${fmt(w.amount)} ${w.currency}`,
        w.status,
        w.status === 'PENDING' ? (
          <span key="a" className="flex gap-1">
            <button onClick={() => run(() => api.post(`/admin/withdrawals/${w.id}/approve`), 'Approved')} className="btn-soft inline-flex items-center gap-1 text-xs"><Check size={13} /></button>
            <button onClick={() => run(() => api.post(`/admin/withdrawals/${w.id}/reject`, { reason: 'rejected' }), 'Rejected')} className="btn-ghost inline-flex items-center gap-1 text-xs"><X size={13} /></button>
          </span>
        ) : <span key="-" className="text-white/30">—</span>,
      ]}
    />
  );
}

function Promo() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-promo'], queryFn: async () => (await api.get('/admin/promocodes')).data });
  const [form, setForm] = useState({ code: '', type: 'BALANCE', currency: 'DEMO', amount: '500' });
  const create = async () => {
    try {
      await api.post('/admin/promocodes', form);
      qc.invalidateQueries({ queryKey: ['adm-promo'] });
      toast.success('Promo created');
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-32" placeholder="CODE (auto)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <select className="input w-32" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option>BALANCE</option>
          <option>VIP_XP</option>
        </select>
        <input className="input w-24" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        <input className="input w-24" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button onClick={create} className="btn-primary">Create</button>
      </div>
      <Table rows={data ?? []} cols={['code', 'type', 'amount', 'used']} render={(p: any) => [p.code, p.type, `${fmt(p.amount)} ${p.currency ?? ''}`, `${p.redeemedCount}`]} />
    </div>
  );
}

function Bonuses() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-bonuses'], queryFn: async () => (await api.get('/admin/bonuses')).data });
  const [form, setForm] = useState({ key: '', name: '', type: 'NO_DEPOSIT', currency: 'DEMO', amount: '0', percent: '', wagerMultiplier: '0' });
  const save = async () => {
    try {
      await api.post('/admin/bonuses', {
        ...form,
        percent: form.percent ? Number(form.percent) : null,
        wagerMultiplier: Number(form.wagerMultiplier) || 0,
      });
      qc.invalidateQueries({ queryKey: ['adm-bonuses'] });
      toast.success('Bonus saved');
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-32" placeholder="key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
        <input className="input w-40" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input w-40" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option>NO_DEPOSIT</option>
          <option>DEPOSIT_MATCH</option>
          <option>FREE_SPINS</option>
        </select>
        <input className="input w-20" placeholder="cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        <input className="input w-20" placeholder="amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input className="input w-20" placeholder="%" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
        <input className="input w-20" placeholder="wager×" value={form.wagerMultiplier} onChange={(e) => setForm({ ...form, wagerMultiplier: e.target.value })} />
        <button onClick={save} className="btn-primary" disabled={!form.key || !form.name}>Save</button>
      </div>
      <Table
        rows={data ?? []}
        cols={['key', 'name', 'type', 'amount', 'enabled']}
        render={(b: any) => [b.key, b.name, b.type, `${fmt(b.amount)} ${b.currency ?? ''}${b.percent ? ` / ${b.percent}%` : ''}`, b.enabled ? 'yes' : 'no']}
      />
    </div>
  );
}

const DEPOSIT_WINDOWS = [1, 7, 14, 30];
const RAFFLE_BLANK = {
  title: 'New Giveaway',
  descriptionRu: '',
  descriptionEn: '',
  currency: 'DEMO',
  mode: 'DEMO',
  prizePool: '5000',
  winnersCount: 3,
  entryCost: '0',
  maxEntriesPerUser: 1,
  drawAt: '',
  closesAt: '',
  requiresDeposit: false,
  minDeposit: '',
  depositWithinDays: '',
  audience: 'ALL',
  partnerId: '',
};

/** ISO → value for <input type="datetime-local"> (local time, minute precision). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function RafflesAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });
  const { data: currencies } = useCurrencies();
  const [form, setForm] = useState<any>(RAFFLE_BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  // Only currencies matching the selected mode (DEMO vs real) — no free-text codes.
  const curOpts = (currencies ?? []).filter((c) => (form.mode === 'DEMO' ? c.type === 'DEMO' : c.type !== 'DEMO'));

  const payload = () => ({
    title: form.title,
    descriptionRu: form.descriptionRu || undefined,
    descriptionEn: form.descriptionEn || undefined,
    currency: form.currency,
    mode: form.mode,
    prizePool: String(form.prizePool),
    winnersCount: Number(form.winnersCount) || 1,
    entryCost: String(form.entryCost || '0'),
    maxEntriesPerUser: Number(form.maxEntriesPerUser) || 1,
    drawAt: form.drawAt ? new Date(form.drawAt).toISOString() : editId ? null : undefined,
    closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : editId ? null : undefined,
    requiresDeposit: !!form.requiresDeposit,
    minDeposit: form.requiresDeposit && form.minDeposit ? String(form.minDeposit) : null,
    depositWithinDays: form.requiresDeposit && form.depositWithinDays ? Number(form.depositWithinDays) : null,
    audience: form.audience,
    partnerId: form.audience === 'PARTNER_REFERRALS' ? form.partnerId || undefined : null,
  });

  const reset = () => {
    setEditId(null);
    setForm(RAFFLE_BLANK);
  };
  const submit = async () => {
    try {
      if (editId) await api.patch(`/raffles/${editId}`, payload());
      else await api.post('/raffles', payload());
      qc.invalidateQueries({ queryKey: ['raffles'] });
      toast.success(editId ? 'Raffle updated' : 'Raffle created');
      reset();
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const edit = (r: any) => {
    setEditId(r.id);
    setForm({
      title: r.title,
      descriptionRu: r.descriptionRu ?? '',
      descriptionEn: r.descriptionEn ?? '',
      currency: r.currency,
      mode: r.mode,
      prizePool: r.prizePool,
      winnersCount: r.winnersCount,
      entryCost: r.entryCost,
      maxEntriesPerUser: r.maxEntriesPerUser,
      drawAt: toLocalInput(r.drawAt),
      closesAt: toLocalInput(r.closesAt),
      requiresDeposit: !!r.requiresDeposit,
      minDeposit: r.minDeposit ?? '',
      depositWithinDays: r.depositWithinDays ?? '',
      audience: r.audience ?? 'ALL',
      partnerId: r.partnerId ?? '',
    });
  };
  const draw = async (id: string) => {
    try {
      await api.post(`/raffles/${id}/draw`, {});
      qc.invalidateQueries({ queryKey: ['raffles'] });
      toast.success('Raffle drawn');
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const cancel = async (id: string) => {
    if (!confirm('Cancel this raffle and refund any paid entries?')) return;
    try {
      await api.post(`/raffles/${id}/cancel`);
      qc.invalidateQueries({ queryKey: ['raffles'] });
      toast.success('Raffle cancelled');
      if (editId === id) reset();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{editId ? 'Edit raffle' : 'New raffle'}</h3>
          {editId && (
            <button onClick={reset} className="chip text-xs text-white/60">New instead</button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <L label="Title"><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} /></L>
          <L label="Mode">
            <select className="input" value={form.mode} onChange={(e) => set({ mode: e.target.value, currency: '' })}>
              <option value="DEMO">DEMO</option>
              <option value="REAL">REAL</option>
            </select>
          </L>
          <L label="Currency">
            <select className="input" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              <option value="" disabled>—</option>
              {curOpts.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </L>
          <L label="Prize pool"><input className="input" value={form.prizePool} onChange={(e) => set({ prizePool: e.target.value })} /></L>
          <L label="Winners"><input className="input" type="number" min={1} value={form.winnersCount} onChange={(e) => set({ winnersCount: +e.target.value })} /></L>
          <L label="Entry cost"><input className="input" value={form.entryCost} onChange={(e) => set({ entryCost: e.target.value })} /></L>
          <L label="Max entries / user"><input className="input" type="number" min={1} value={form.maxEntriesPerUser} onChange={(e) => set({ maxEntriesPerUser: +e.target.value })} /></L>
          <L label="Draw at (auto)"><input className="input" type="datetime-local" value={form.drawAt} onChange={(e) => set({ drawAt: e.target.value })} /></L>
          <L label="Closes at"><input className="input" type="datetime-local" value={form.closesAt} onChange={(e) => set({ closesAt: e.target.value })} /></L>
          <L label="Audience">
            <select className="input" value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
              <option value="ALL">Everyone</option>
              <option value="PARTNER_REFERRALS">Partner referrals</option>
            </select>
          </L>
          {form.audience === 'PARTNER_REFERRALS' && (
            <L label="Partner ID (blank = you)"><input className="input" value={form.partnerId} onChange={(e) => set({ partnerId: e.target.value })} placeholder="user id" /></L>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <L label="Description (RU)"><input className="input" value={form.descriptionRu} onChange={(e) => set({ descriptionRu: e.target.value })} /></L>
          <L label="Description (EN)"><input className="input" value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} /></L>
          <L label="Requires deposit">
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requiresDeposit} onChange={(e) => set({ requiresDeposit: e.target.checked })} />
              <span className="text-white/60">enable conditions</span>
            </label>
          </L>
          {form.requiresDeposit && (
            <>
              <L label="Min deposit"><input className="input" value={form.minDeposit} onChange={(e) => set({ minDeposit: e.target.value })} placeholder="any" /></L>
              <L label="Deposit within">
                <select className="input" value={form.depositWithinDays} onChange={(e) => set({ depositWithinDays: e.target.value })}>
                  <option value="">any time</option>
                  {DEPOSIT_WINDOWS.map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </L>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={submit} className="btn-primary" disabled={!form.currency}>{editId ? 'Save changes' : 'Create'}</button>
          {editId && <button onClick={() => cancel(editId)} className="btn-soft text-rose-300">Cancel raffle</button>}
        </div>
      </div>
      <Table
        rows={data ?? []}
        cols={['title', 'prize', 'audience', 'participants', 'status', '']}
        render={(r: any) => [
          r.title,
          `${fmt(r.prizePool)} ${r.currency}`,
          enumLabel('raffleAudience', r.audience),
          r.participants,
          enumLabel('raffleStatus', r.status),
          <div key="act" className="flex gap-1.5">
            {(r.status === 'OPEN' || r.status === 'DRAFT') && <button onClick={() => edit(r)} className="btn-soft text-xs">Edit</button>}
            {r.status === 'OPEN' && <button onClick={() => draw(r.id)} className="btn-soft text-xs">Draw</button>}
            {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && <button onClick={() => cancel(r.id)} className="btn-soft text-xs text-rose-300">Cancel</button>}
            {(r.status === 'COMPLETED' || r.status === 'CANCELLED') && <span className="text-white/30">—</span>}
          </div>,
        ]}
      />
    </div>
  );
}

/** Compact labelled field for admin forms. */
function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      {children}
    </label>
  );
}

function Currencies() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-cur'], queryFn: async () => (await api.get('/admin/currencies')).data });
  const save = async (c: any, patch: any) => {
    try {
      await api.post('/admin/currencies', { ...c, ...patch });
      qc.invalidateQueries({ queryKey: ['adm-cur'] });
      toast.success(`${c.code} saved`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <Table
      rows={data ?? []}
      cols={['code', 'type', 'networks', 'usd rate', 'enabled']}
      render={(c: any) => [
        <span key="c" className="font-semibold">{c.code}</span>,
        c.type,
        (c.networks ?? []).join(', ') || '—',
        <input key="r" className="input w-24 !py-1" defaultValue={c.usdRate} onBlur={(e) => e.target.value !== String(c.usdRate) && save(c, { usdRate: e.target.value })} />,
        <button key="t" onClick={() => save(c, { enabled: !c.enabled })} className={`chip ${c.enabled ? 'text-mint' : 'text-white/40'}`}>{c.enabled ? 'on' : 'off'}</button>,
      ]}
    />
  );
}

function Broadcast() {
  const [form, setForm] = useState({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '', onlyVerified: false });
  const send = async () => {
    try {
      const { data } = await api.post('/admin/broadcast', form);
      toast.success(`Sent to ${data.count} users`);
      setForm({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '', onlyVerified: false });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="card max-w-2xl space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Megaphone size={18} className="text-sun" /> Broadcast notification</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Заголовок (RU)" value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} />
        <input className="input" placeholder="Title (EN)" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
        <textarea className="input min-h-20" placeholder="Текст (RU)" value={form.bodyRu} onChange={(e) => setForm({ ...form, bodyRu: e.target.value })} />
        <textarea className="input min-h-20" placeholder="Body (EN)" value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={form.onlyVerified} onChange={(e) => setForm({ ...form, onlyVerified: e.target.checked })} />
        Only KYC-verified users
      </label>
      <button onClick={send} className="btn-primary" disabled={!form.titleRu || !form.titleEn}>Send</button>
    </div>
  );
}

function Tickets() {
  const { data } = useQuery({ queryKey: ['adm-tickets'], queryFn: async () => (await api.get('/admin/tickets')).data });
  return (
    <Table
      rows={data ?? []}
      cols={['user', 'subject', 'status', 'updated']}
      render={(t: any) => [
        `${t.user?.username} #${t.user?.accountId}`,
        t.subject,
        t.status,
        new Date(t.updatedAt).toLocaleString(),
      ]}
    />
  );
}

function Transactions() {
  const { data } = useQuery({ queryKey: ['adm-txs'], queryFn: async () => (await api.get('/admin/transactions?take=120')).data });
  return (
    <Table
      rows={data ?? []}
      cols={['user', 'type', 'amount', 'when']}
      render={(x: any) => [
        `${x.user?.username ?? '—'} ${x.user?.accountId ? `#${x.user.accountId}` : ''}`,
        x.type,
        <span key="a" className={x.direction === 'CREDIT' ? 'text-mint' : 'text-white/60'}>{x.direction === 'CREDIT' ? '+' : '−'}{fmt(x.amount, 4)} {x.currency} ({x.mode})</span>,
        new Date(x.createdAt).toLocaleString(),
      ]}
    />
  );
}

function Content() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-content'], queryFn: async () => (await api.get('/admin/content')).data });
  const [form, setForm] = useState({ key: '', locale: 'ru', title: '', body: '' });
  const save = async () => {
    try {
      await api.post('/admin/content', form);
      qc.invalidateQueries({ queryKey: ['adm-content'] });
      toast.success('Content saved');
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap gap-2">
          <input className="input w-40" placeholder="key (e.g. terms)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <select className="input w-24" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
            <option>ru</option>
            <option>en</option>
          </select>
          <input className="input flex-1" placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <textarea className="input min-h-32" placeholder="body (markdown)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <button onClick={save} className="btn-primary" disabled={!form.key}>Save</button>
      </div>
      <Table
        rows={data ?? []}
        cols={['key', 'locale', 'title']}
        render={(c: any) => [
          <button key="e" onClick={() => setForm({ key: c.key, locale: c.locale, title: c.title, body: c.body })} className="text-lav hover:underline">{c.key}</button>,
          c.locale,
          c.title,
        ]}
      />
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-set'], queryFn: async () => (await api.get('/admin/settings')).data });
  // The roulette's live RTP is the game row's column — the engine, payouts and
  // the in-game info/fairness panel all read it. Edit it here (not the AppSetting,
  // which the per-game column shadows).
  const { data: roul } = useQuery({ queryKey: ['adm-roulette'], queryFn: async () => (await api.get('/games/roulette')).data });
  const [key, setKey] = useState('game.rtp');
  const [value, setValue] = useState('0.973');
  const save = async (k = key, raw = value) => {
    let v: any = raw;
    try { v = JSON.parse(raw); } catch { /* keep string */ }
    try {
      await api.post('/admin/settings', { key: k, value: v });
      qc.invalidateQueries({ queryKey: ['adm-set'] });
      toast.success(`${k} saved`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const saveRtp = async (raw: string) => {
    try {
      const { data: g } = await api.patch('/admin/games/roulette', { rtp: Number(raw) });
      qc.invalidateQueries({ queryKey: ['adm-roulette'] });
      qc.invalidateQueries({ queryKey: ['roulette-info'] });
      qc.invalidateQueries({ queryKey: ['games'] });
      toast.success(`Roulette RTP → ${(g.rtp * 100).toFixed(2)}%`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Roulette RTP</label>
          <input
            key={roul?.rtp}
            className="input w-40"
            type="number"
            step="0.001"
            min="0.5"
            max="1"
            defaultValue={roul?.rtp ?? 0.973}
            onBlur={(e) => saveRtp(e.target.value)}
          />
          <p className="mt-1 text-xs text-white/40">Доля 0–1 или % (напр. 97.3). Применяется к игре сразу.</p>
        </div>
        <p className="text-xs text-white/40">Edit any setting below; values are parsed as JSON when possible.</p>
      </div>
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-56" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="input w-40" value={value} onChange={(e) => setValue(e.target.value)} />
        <button onClick={() => save()} className="btn-primary">Save</button>
      </div>
      <Table rows={data ?? []} cols={['key', 'value']} render={(s: any) => [s.key, JSON.stringify(s.value)]} />
    </div>
  );
}

function Audit() {
  const { data } = useQuery({ queryKey: ['adm-audit'], queryFn: async () => (await api.get('/admin/audit?take=80')).data });
  return <Table rows={data ?? []} cols={['action', 'target', 'when']} render={(a: any) => [a.action, `${a.targetType ?? ''} ${a.targetId ?? ''}`, new Date(a.createdAt).toLocaleString()]} />;
}

const GAME_CATEGORIES = ['ROULETTE', 'SLOTS', 'LIVE', 'MINIGAME'];
const EMPTY_GAME = {
  key: '', name: '', type: 'slots', category: 'SLOTS', provider: '', status: 'COMING_SOON',
  route: '', rtp: '0.96', sortOrder: '10', enabled: true, descriptionRu: '', descriptionEn: '',
};

function GamesAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-games'], queryFn: async () => (await api.get('/admin/games')).data });
  const [form, setForm] = useState<any>(EMPTY_GAME);
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['adm-games'] });
    qc.invalidateQueries({ queryKey: ['games'] });
    qc.invalidateQueries({ queryKey: ['game-filters'] });
  };
  const save = async () => {
    try {
      await api.post('/admin/games', { ...form, rtp: Number(form.rtp), sortOrder: Number(form.sortOrder) });
      refresh();
      toast.success('Game saved');
      setForm(EMPTY_GAME);
    } catch (e) { toast.error(apiError(e)); }
  };
  const toggle = async (g: any) => {
    try { await api.post('/admin/games', { ...g, enabled: !g.enabled }); refresh(); } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (key: string) => {
    if (!confirm(`Delete game "${key}"?`)) return;
    try { await api.delete(`/admin/games/${key}`); refresh(); toast.success('Deleted'); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <div className="text-sm font-semibold text-white/70">{form.key ? `Edit / create` : 'Create'} game</div>
        <div className="flex flex-wrap gap-2">
          <input className="input w-36" placeholder="key (unique)" value={form.key} onChange={(e) => set({ key: e.target.value })} />
          <input className="input w-44" placeholder="name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <input className="input w-40" placeholder="provider" value={form.provider} onChange={(e) => set({ provider: e.target.value })} />
          <select className="input w-32" value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {GAME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input w-36" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="LIVE">LIVE</option>
            <option value="COMING_SOON">COMING_SOON</option>
          </select>
          <input className="input w-28" placeholder="rtp (0–1)" value={form.rtp} onChange={(e) => set({ rtp: e.target.value })} />
          <input className="input w-24" placeholder="sort" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
          <input className="input w-40" placeholder="route (/roulette)" value={form.route} onChange={(e) => set({ route: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" placeholder="Описание (RU)" value={form.descriptionRu} onChange={(e) => set({ descriptionRu: e.target.value })} />
          <input className="input flex-1" placeholder="Description (EN)" value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-white/60">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> enabled
          </label>
          <button onClick={save} className="btn-primary" disabled={!form.key}>Save</button>
          {form.key && <button onClick={() => setForm(EMPTY_GAME)} className="btn-ghost text-sm">Clear</button>}
        </div>
      </div>

      <Table
        rows={data ?? []}
        cols={['name', 'category', 'provider', 'rtp', 'status', 'enabled', '']}
        render={(g: any) => [
          <button key="e" onClick={() => setForm({ ...EMPTY_GAME, ...g, rtp: String(g.rtp), sortOrder: String(g.sortOrder ?? 0), route: g.route ?? '', descriptionRu: g.descriptionRu ?? '', descriptionEn: g.descriptionEn ?? '' })} className="text-lav hover:underline">{g.name}</button>,
          g.category,
          g.provider,
          `${(g.rtp * 100).toFixed(2)}%`,
          g.status,
          <button key="t" onClick={() => toggle(g)} className={`chip ${g.enabled ? 'text-mint' : 'text-white/40'}`}>{g.enabled ? 'on' : 'off'}</button>,
          <button key="d" onClick={() => del(g.key)} className="btn-ghost !px-2 !py-1 text-xs text-roul-red"><X size={13} /></button>,
        ]}
      />
    </div>
  );
}

function ChatAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-chat'], queryFn: async () => (await api.get('/admin/chat?take=100')).data, refetchInterval: 10_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['adm-chat'] });
  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); refresh(); toast.success(ok); } catch (e) { toast.error(apiError(e)); }
  };
  const isMuted = (m: any) => m.mutedUntil && new Date(m.mutedUntil) > new Date();

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm text-white/55">Лента чата (обновляется автоматически). Удаляйте сообщения и ограничивайте авторов.</div>
      <div className="space-y-1.5">
        {(data ?? []).map((m: any) => (
          <div key={m.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${m.deleted ? 'bg-roul-red/5 text-white/30' : 'bg-white/[0.03]'}`}>
            <span className="w-32 shrink-0 truncate text-white/45">{m.username} <span className="text-white/25">#{m.accountId}</span></span>
            <span className={`min-w-0 flex-1 truncate ${m.deleted ? 'line-through' : ''}`}>{m.body}</span>
            {isMuted(m) && <span className="chip shrink-0 text-[10px] text-roul-red">muted</span>}
            <span className="shrink-0 text-xs text-white/25">{new Date(m.createdAt).toLocaleTimeString()}</span>
            <div className="flex shrink-0 gap-1">
              {!m.deleted && (
                <button onClick={() => run(() => api.delete(`/admin/chat/${m.id}`), 'Deleted')} className="btn-ghost !px-2 !py-1 text-xs text-roul-red" title="Delete message"><X size={13} /></button>
              )}
              {isMuted(m) ? (
                <button onClick={() => run(() => api.post(`/admin/users/${m.userId}/mute`, { minutes: 0 }), 'Unmuted')} className="btn-ghost !px-2 !py-1 text-xs text-mint">Unmute</button>
              ) : (
                <button onClick={() => run(() => api.post(`/admin/users/${m.userId}/mute`, { minutes: 60 }), 'Muted 60m')} className="btn-ghost !px-2 !py-1 text-xs">Mute 60m</button>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <div className="py-4 text-center text-white/40">—</div>}
      </div>
    </div>
  );
}

function Roles() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-perms'], queryFn: async () => (await api.get('/admin/permissions')).data });
  const en = i18n.language?.startsWith('en');

  const registry: any[] = data?.registry ?? [];
  const managedRoles: string[] = data?.managedRoles ?? [];
  const roleMap: Record<string, Record<string, boolean>> = {};
  for (const r of data?.roles ?? []) roleMap[r.role] = r.permissions;

  const groups = Array.from(new Set(registry.map((p) => p.group)));

  const toggle = async (role: string, permission: string, allowed: boolean) => {
    try {
      await api.post('/admin/permissions', { role, permission, allowed });
      qc.invalidateQueries({ queryKey: ['adm-perms'] });
      qc.invalidateQueries({ queryKey: ['admin-me'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4 text-sm text-white/55">
        <Shield size={16} className="mr-1.5 inline text-lav" />
        Включайте или выключайте отдельные действия для ролей. <b className="text-white/80">ADMIN</b> всегда имеет полный доступ. Назначайте роли пользователям во вкладке <b className="text-white/80">Users</b>.
      </div>
      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40">
              <th className="pb-2 font-medium">Право / Permission</th>
              <th className="pb-2 text-center font-medium text-white/30">ADMIN</th>
              {managedRoles.map((r) => (
                <th key={r} className="pb-2 text-center font-medium">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr>
                  <td colSpan={2 + managedRoles.length} className="pt-3 pb-1 text-xs uppercase tracking-wide text-white/30">{g}</td>
                </tr>
                {registry.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <div>{en ? p.labelEn : p.labelRu}</div>
                      <div className="text-xs text-white/30">{p.key}</div>
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" checked readOnly disabled className="opacity-40" />
                    </td>
                    {managedRoles.map((role) => (
                      <td key={role} className="py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!roleMap[role]?.[p.key]}
                          onChange={(e) => toggle(role, p.key, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-lav"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Table({ rows, cols, render }: { rows: any[]; cols: string[]; render: (r: any) => any[] }) {
  return (
    <div className="card overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-white/40">
            {cols.map((c) => (
              <th key={c} className="pb-2 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-white/5">
              {render(r).map((cell, j) => (
                <td key={j} className="py-2 pr-3">{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="py-4 text-center text-white/40">—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
