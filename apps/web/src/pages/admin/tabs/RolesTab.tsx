import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { Fragment } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { enumLabel } from '../../../lib/labels';
import { useAct } from '../shared/useAct';

export function RolesTab() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({ queryKey: ['adm-perms'], queryFn: async () => (await api.get('/admin/permissions')).data });
  const en = i18n.language?.startsWith('en');
  const act = useAct('adm-perms', 'admin-me');

  const registry: any[] = data?.registry ?? [];
  const managedRoles: string[] = data?.managedRoles ?? [];
  const roleMap: Record<string, Record<string, boolean>> = {};
  for (const r of data?.roles ?? []) roleMap[r.role] = r.permissions;

  const groups = Array.from(new Set(registry.map((p) => p.group)));

  const toggle = (role: string, permission: string, allowed: boolean) =>
    act(() => api.post('/admin/permissions', { role, permission, allowed }));

  return (
    <div className="space-y-3">
      <div className="card p-4 text-sm text-white/55">
        <Shield size={16} className="mr-1.5 inline text-lav" />
        <Trans i18nKey="admin.roles.hint">
          Включайте или выключайте отдельные действия для ролей. <b className="text-white/80">ADMIN</b> всегда имеет полный доступ.
        </Trans>
      </div>
      <div className="card overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40">
              <th className="pb-2 font-medium">{t('admin.roles.permission')}</th>
              <th className="pb-2 text-center font-medium text-white/30">{enumLabel('role', 'ADMIN')}</th>
              {managedRoles.map((r) => (
                <th key={r} className="pb-2 text-center font-medium">{enumLabel('role', r)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr>
                  <td colSpan={2 + managedRoles.length} className="pt-3 pb-1 text-xs uppercase tracking-wide text-white/30">
                    {t(`admin.roles.groups.${g}`, { defaultValue: g })}
                  </td>
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
