import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusChip } from '../../../../components/StatusChip';
import api from '../../../../lib/api';
import { type AdminMe } from '../../../../lib/hooks';
import { enumLabel } from '../../../../lib/labels';
import { UserDetail } from './UserDetail';

export function UsersTab({ me }: { me: AdminMe }) {
  const { t } = useTranslation();
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
        <input className="input mb-3" placeholder={t('admin.users.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="space-y-1">
          {(data?.items ?? []).map((u: any) => (
            <button
              key={u.id}
              onClick={() => setSel(u.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${sel === u.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <span>{u.username} <span className="text-white/40">#{u.accountId}</span></span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="chip">{enumLabel('role', u.role)}</span>
                <StatusChip category="userStatus" value={u.status} />
              </span>
            </button>
          ))}
          {(data?.items ?? []).length === 0 && <div className="py-3 text-center text-white/40">—</div>}
        </div>
      </div>

      {user && <UserDetail key={user.id} user={user} me={me} refresh={refresh} />}
    </div>
  );
}
