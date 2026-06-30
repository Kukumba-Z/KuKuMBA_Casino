import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LifeBuoy, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { StatusChip } from '../components/StatusChip';
import { TicketThread } from '../components/TicketThread';
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('subject', subject);
      fd.append('message', message);
      if (file) fd.append('file', file);
      await api.post('/support/tickets', fd);
      setSubject('');
      setMessage('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
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
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-2">
                  <Paperclip size={16} /> {t('support.attachPhotoVideo')}
                </button>
                {file && (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-white/60">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      className="text-white/40 hover:text-white"
                      aria-label={t('common.remove')}
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
              </div>
              <button className="btn-primary">{t('common.submit')}</button>
            </form>
          </div>
        )}

        {authed && tickets && tickets.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{t('support.tickets')}</h2>
            <div className="space-y-2">
              {tickets.map((tk: any) => (
                <button
                  key={tk.id}
                  onClick={() => setOpenId(tk.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-left text-sm transition hover:bg-white/[0.06]"
                >
                  <span className="truncate">{tk.subject}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusChip category="ticketStatus" value={tk.status} />
                    <ChevronRight size={16} className="text-white/40" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!openId} onClose={() => setOpenId(null)} title={t('support.title')}>
        {openId && (
          <TicketThread ticketId={openId} base="/support" onChanged={() => qc.invalidateQueries({ queryKey: ['tickets'] })} />
        )}
      </Modal>
    </div>
  );
}
