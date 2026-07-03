import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../../../lib/api';
import { toast } from '../../../store/toast';

export function BroadcastTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '', onlyVerified: false });
  const send = async () => {
    try {
      const { data } = await api.post('/admin/broadcast', form);
      toast.success(t('admin.broadcast.sent', { count: data.count }));
      setForm({ titleRu: '', titleEn: '', bodyRu: '', bodyEn: '', onlyVerified: false });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="card max-w-2xl space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Megaphone size={18} className="text-sun" /> {t('admin.broadcast.title')}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder={t('admin.broadcast.titleRu')} value={form.titleRu} onChange={(e) => setForm({ ...form, titleRu: e.target.value })} />
        <input className="input" placeholder={t('admin.broadcast.titleEn')} value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
        <textarea className="input min-h-20" placeholder={t('admin.broadcast.bodyRu')} value={form.bodyRu} onChange={(e) => setForm({ ...form, bodyRu: e.target.value })} />
        <textarea className="input min-h-20" placeholder={t('admin.broadcast.bodyEn')} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={form.onlyVerified} onChange={(e) => setForm({ ...form, onlyVerified: e.target.checked })} />
        {t('admin.broadcast.onlyVerified')}
      </label>
      <button onClick={send} className="btn-primary" disabled={!form.titleRu || !form.titleEn}>{t('admin.common.send')}</button>
    </div>
  );
}
