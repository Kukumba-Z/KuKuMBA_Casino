import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { can, useAdminMe } from '../../lib/hooks';
import { enumLabel } from '../../lib/labels';
import { TABS } from './registry';

export default function AdminPage() {
  const { t } = useTranslation();
  const { data: me } = useAdminMe();
  const visible = useMemo(() => TABS.filter((tab) => can(me, tab.perm)), [me]);
  const [tab, setTab] = useState('dashboard');
  // Fall back to the first tab the operator can actually see.
  const activeKey = visible.some((x) => x.key === tab) ? tab : visible[0]?.key;
  const active = visible.find((x) => x.key === activeKey);

  if (!me) return <div className="card p-6 text-center text-white/50">{t('common.loading')}</div>;
  if (visible.length === 0)
    return <div className="card p-6 text-center text-white/50">{t('admin.noPerms')}</div>;

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <ShieldCheck size={24} className="text-lav" /> {t('admin.title')} · KuKuMBA
        <span className="chip ml-1 text-xs">{enumLabel('role', me.role)}</span>
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition ${activeKey === key ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
          >
            <Icon size={15} /> {t(labelKey)}
          </button>
        ))}
      </div>
      {active && <active.Component me={me} />}
    </div>
  );
}
