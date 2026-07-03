import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

export function DashboardTab() {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-dash'], queryFn: async () => (await api.get('/admin/dashboard')).data });
  const items: [string, number | undefined][] = [
    [t('admin.dash.users'), data?.users],
    [t('admin.dash.pendingDeposits'), data?.pendingDeposits],
    [t('admin.dash.pendingWithdrawals'), data?.pendingWithdrawals],
    [t('admin.dash.openRaffles'), data?.openRaffles],
    [t('admin.dash.openTickets'), data?.openTickets],
    [t('admin.dash.rounds'), data?.rounds],
    [t('admin.dash.kycPending'), data?.kycPending],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([l, v]) => (
        <div key={l} className="stat">
          <div className="text-xs uppercase text-white/40">{l}</div>
          <div className="text-2xl font-extrabold">{v ?? 0}</div>
        </div>
      ))}
    </div>
  );
}
