import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

export default function Support() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { data: faq } = useQuery({ queryKey: ['faq'], queryFn: async () => (await api.get('/support/faq')).data });
  const { data: tickets } = useQuery({ queryKey: ['tickets'], enabled: authed, queryFn: async () => (await api.get('/support/tickets')).data });

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/support/tickets', { subject, message });
      setSubject('');
      setMessage('');
      toast.success(t('support.ticketCreated'));
      qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <LifeBuoy size={24} className="text-sky" /> {t('support.title')}
        </h1>

        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold">{t('support.faq')}</h2>
          <div className="space-y-2">
            {(faq ?? []).map((f: any, i: number) => (
              <details key={i} className="rounded-xl bg-white/[0.03] p-3">
                <summary className="cursor-pointer font-medium">{en ? f.q.en : f.q.ru}</summary>
                <p className="mt-2 text-sm text-white/60">{en ? f.a.en : f.a.ru}</p>
              </details>
            ))}
          </div>
        </div>

        {authed && (
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{t('support.newTicket')}</h2>
            <form onSubmit={create} className="space-y-3">
              <input className="input" placeholder={t('support.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <textarea className="input min-h-28" placeholder={t('support.message')} value={message} onChange={(e) => setMessage(e.target.value)} required />
              <button className="btn-primary">{t('common.submit')}</button>
            </form>
          </div>
        )}

        {authed && tickets && tickets.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{t('support.tickets')}</h2>
            <div className="space-y-2">
              {tickets.map((tk: any) => (
                <div key={tk.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                  <span>{tk.subject}</span>
                  <span className="chip">{tk.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
