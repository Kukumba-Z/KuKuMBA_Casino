import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Coins,
  FileText,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  PartyPopper,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  Tag,
  Users as UsersIcon,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';
import { toast } from '../store/toast';

const TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: UsersIcon },
  { key: 'deposits', label: 'Deposits', icon: ArrowDownToLine },
  { key: 'withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
  { key: 'promo', label: 'Promo', icon: Tag },
  { key: 'bonuses', label: 'Bonuses', icon: Gift },
  { key: 'raffles', label: 'Raffles', icon: PartyPopper },
  { key: 'currencies', label: 'Currencies', icon: Coins },
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone },
  { key: 'tickets', label: 'Tickets', icon: LifeBuoy },
  { key: 'transactions', label: 'Transactions', icon: Receipt },
  { key: 'content', label: 'Content', icon: FileText },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
  { key: 'audit', label: 'Audit', icon: ScrollText },
];

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <ShieldCheck size={24} className="text-lav" /> Admin · KuKuMBA
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition ${tab === key ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <Users />}
      {tab === 'deposits' && <Deposits />}
      {tab === 'withdrawals' && <Withdrawals />}
      {tab === 'promo' && <Promo />}
      {tab === 'bonuses' && <Bonuses />}
      {tab === 'raffles' && <RafflesAdmin />}
      {tab === 'currencies' && <Currencies />}
      {tab === 'broadcast' && <Broadcast />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'transactions' && <Transactions />}
      {tab === 'content' && <Content />}
      {tab === 'settings' && <Settings />}
      {tab === 'audit' && <Audit />}
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

function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['adm-users', q], queryFn: async () => (await api.get(`/admin/users?q=${encodeURIComponent(q)}`)).data });
  const { data: user } = useQuery({ queryKey: ['adm-user', sel], enabled: !!sel, queryFn: async () => (await api.get(`/admin/users/${sel}`)).data });

  const [amount, setAmount] = useState('100');
  const [currency, setCurrency] = useState('DEMO');
  const [mode, setMode] = useState('DEMO');

  const act = async (fn: () => Promise<any>, ok = 'Done') => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['adm-user', sel] });
      qc.invalidateQueries({ queryKey: ['adm-users', q] });
      toast.success(ok);
    } catch (e) {
      toast.error(apiError(e));
    }
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

      {user && (
        <div className="card space-y-3 p-4">
          <div className="font-bold">{user.username} · #{user.accountId}</div>
          <div className="text-sm text-white/50">{user.email} · VIP {user.vipLevel} · KYC {user.kycStatus}</div>
          <div className="flex flex-wrap gap-1.5 text-sm">
            {(user.balances ?? []).map((b: any) => (
              <span key={b.currency + b.mode} className="chip">{fmt(b.amount, 4)} {b.currency} ({b.mode})</span>
            ))}
          </div>
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
            <button onClick={() => act(() => api.post('/admin/balance/adjust', { userId: sel, currency, mode, amount }), 'Balance updated')} className="btn-soft w-full text-sm">
              Apply
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.status === 'BANNED' ? (
              <button onClick={() => act(() => api.post(`/admin/users/${sel}/status`, { status: 'ACTIVE' }), 'Unbanned')} className="btn-ghost text-sm text-mint">Unban</button>
            ) : (
              <button onClick={() => act(() => api.post(`/admin/users/${sel}/status`, { status: 'BANNED' }), 'Banned')} className="btn-ghost text-sm text-roul-red">Ban</button>
            )}
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/kyc`, { approve: true }), 'KYC approved')} className="btn-ghost inline-flex items-center gap-1 text-sm text-mint"><Check size={14} /> KYC</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/kyc`, { approve: false, note: 'rejected' }), 'KYC rejected')} className="btn-ghost inline-flex items-center gap-1 text-sm"><X size={14} /> KYC</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/vip`, { level: (user.vipLevel ?? 0) + 1 }), 'VIP +1')} className="btn-ghost text-sm">VIP +1</button>
            {user.role === 'ADMIN' ? (
              <button onClick={() => act(() => api.post(`/admin/users/${sel}/role`, { role: 'USER' }), 'Role: user')} className="btn-ghost text-sm">Make user</button>
            ) : (
              <button onClick={() => act(() => api.post(`/admin/users/${sel}/role`, { role: 'ADMIN' }), 'Role: admin')} className="btn-ghost text-sm text-lav">Make admin</button>
            )}
          </div>
        </div>
      )}
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

function RafflesAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });
  const [form, setForm] = useState({ title: 'New Giveaway', currency: 'DEMO', mode: 'DEMO', prizePool: '5000', winnersCount: 3, entryCost: '0' });
  const create = async () => {
    try {
      await api.post('/raffles', form);
      qc.invalidateQueries({ queryKey: ['raffles'] });
      toast.success('Raffle created');
    } catch (e) {
      toast.error(apiError(e));
    }
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
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-44" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input w-24" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        <input className="input w-24" value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} placeholder="prize" />
        <input className="input w-20" type="number" value={form.winnersCount} onChange={(e) => setForm({ ...form, winnersCount: +e.target.value })} placeholder="winners" />
        <button onClick={create} className="btn-primary">Create</button>
      </div>
      <Table
        rows={data ?? []}
        cols={['title', 'prize', 'participants', 'status', '']}
        render={(r: any) => [
          r.title,
          `${fmt(r.prizePool)} ${r.currency}`,
          r.participants,
          r.status,
          r.status === 'OPEN' ? <button key="d" onClick={() => draw(r.id)} className="btn-soft text-xs">Draw</button> : <span key="-" className="text-white/30">—</span>,
        ]}
      />
    </div>
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
  const rtp = (data ?? []).find((s: any) => s.key === 'game.rtp');
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Roulette RTP (0–1)</label>
          <input className="input w-40" type="number" step="0.001" min="0.5" max="1" defaultValue={rtp?.value ?? 0.973} onBlur={(e) => save('game.rtp', e.target.value)} />
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
