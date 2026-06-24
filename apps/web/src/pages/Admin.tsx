import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api, { apiError } from '../lib/api';
import { fmt } from '../lib/hooks';

const TABS = ['Dashboard', 'Users', 'Deposits', 'Withdrawals', 'Promo', 'Raffles', 'Settings', 'Audit'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('Dashboard');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">⚙ Admin · KuKuMBA</h1>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-xl px-3 py-1.5 text-sm transition ${tab === tb ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
          >
            {tb}
          </button>
        ))}
      </div>
      {tab === 'Dashboard' && <Dashboard />}
      {tab === 'Users' && <Users />}
      {tab === 'Deposits' && <Deposits />}
      {tab === 'Withdrawals' && <Withdrawals />}
      {tab === 'Promo' && <Promo />}
      {tab === 'Raffles' && <RafflesAdmin />}
      {tab === 'Settings' && <Settings />}
      {tab === 'Audit' && <Audit />}
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
  const [msg, setMsg] = useState('');

  const act = async (fn: () => Promise<any>) => {
    setMsg('');
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['adm-user', sel] });
      setMsg('✅');
    } catch (e) {
      setMsg('⚠ ' + apiError(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <input className="input mb-3" placeholder="Поиск (имя / email / ID)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {(data?.items ?? []).map((u: any) => (
            <button key={u.id} onClick={() => setSel(u.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${sel === u.id ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <span>{u.username} <span className="text-white/40">#{u.accountId}</span></span>
              <span className="chip">{u.role} · {u.status}</span>
            </button>
          ))}
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
            <div className="text-xs text-white/40">Корректировка баланса</div>
            <div className="grid grid-cols-3 gap-2">
              <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option>DEMO</option>
                <option>REAL</option>
              </select>
            </div>
            <button onClick={() => act(() => api.post('/admin/balance/adjust', { userId: sel, currency, mode, amount }))} className="btn-soft w-full text-sm">
              Применить
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/status`, { status: 'BANNED' }))} className="btn-ghost text-sm text-roul-red">Бан</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/status`, { status: 'ACTIVE' }))} className="btn-ghost text-sm">Разбан</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/kyc`, { approve: true }))} className="btn-ghost text-sm text-mint">KYC ✓</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/kyc`, { approve: false, note: 'rejected' }))} className="btn-ghost text-sm">KYC ✕</button>
            <button onClick={() => act(() => api.post(`/admin/users/${sel}/vip`, { level: (user.vipLevel ?? 0) + 1 }))} className="btn-ghost text-sm">VIP +1</button>
          </div>
          {msg && <div className="text-sm">{msg}</div>}
        </div>
      )}
    </div>
  );
}

function Deposits() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-deps'], queryFn: async () => (await api.get('/admin/deposits?status=PENDING')).data });
  return (
    <Table
      rows={data ?? []}
      cols={['user', 'amount', 'status', '']}
      render={(d: any) => [
        `${d.user?.username} #${d.user?.accountId}`,
        `${fmt(d.amount)} ${d.currency} (${d.network ?? '-'})`,
        d.status,
        <button key="c" onClick={async () => { await api.post(`/admin/deposits/${d.id}/confirm`); qc.invalidateQueries({ queryKey: ['adm-deps'] }); }} className="btn-soft text-xs">Confirm</button>,
      ]}
    />
  );
}

function Withdrawals() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-wd'], queryFn: async () => (await api.get('/admin/withdrawals')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ['adm-wd'] });
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
            <button onClick={async () => { await api.post(`/admin/withdrawals/${w.id}/approve`); refresh(); }} className="btn-soft text-xs">✓</button>
            <button onClick={async () => { await api.post(`/admin/withdrawals/${w.id}/reject`, { reason: 'rejected' }); refresh(); }} className="btn-ghost text-xs">✕</button>
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
    await api.post('/admin/promocodes', form);
    qc.invalidateQueries({ queryKey: ['adm-promo'] });
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

function RafflesAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['raffles'], queryFn: async () => (await api.get('/raffles')).data });
  const [form, setForm] = useState({ title: 'New Giveaway', currency: 'DEMO', mode: 'DEMO', prizePool: '5000', winnersCount: 3, entryCost: '0' });
  const create = async () => {
    await api.post('/raffles', form);
    qc.invalidateQueries({ queryKey: ['raffles'] });
  };
  const draw = async (id: string) => {
    await api.post(`/raffles/${id}/draw`, {});
    qc.invalidateQueries({ queryKey: ['raffles'] });
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
        cols={['title', 'prize', 'status', '']}
        render={(r: any) => [
          r.title,
          `${fmt(r.prizePool)} ${r.currency}`,
          r.status,
          r.status === 'OPEN' ? <button key="d" onClick={() => draw(r.id)} className="btn-soft text-xs">Draw</button> : <span key="-" className="text-white/30">—</span>,
        ]}
      />
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['adm-set'], queryFn: async () => (await api.get('/admin/settings')).data });
  const [key, setKey] = useState('game.rtp');
  const [value, setValue] = useState('0.99');
  const save = async () => {
    let v: any = value;
    try { v = JSON.parse(value); } catch { /* keep string */ }
    await api.post('/admin/settings', { key, value: v });
    qc.invalidateQueries({ queryKey: ['adm-set'] });
  };
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input w-56" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="input w-40" value={value} onChange={(e) => setValue(e.target.value)} />
        <button onClick={save} className="btn-primary">Save</button>
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
