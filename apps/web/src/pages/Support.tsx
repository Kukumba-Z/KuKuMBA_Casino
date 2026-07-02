import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileText, LifeBuoy, MessageSquare, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { StatusChip } from '../components/StatusChip';
import { fmtBytes, TicketThread } from '../components/TicketThread';
import api, { apiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';

const MAX_FILE_MB = 50; // mirrors the server cap (UPLOADS_MAX_FILE_MB)
const CATEGORIES = ['general', 'payments', 'game', 'bonus', 'account', 'other'];

export default function Support() {
  const { t, i18n } = useTranslation();
  const en = i18n.language?.startsWith('en');
  const qc = useQueryClient();
  const authed = !!useAuth((s) => s.accessToken);
  const { data: faq } = useQuery({ queryKey: ['faq'], queryFn: async () => (await api.get('/support/faq')).data });
  const { data: tickets } = useQuery({ queryKey: ['tickets'], enabled: authed, queryFn: async () => (await api.get('/support/tickets')).data });

  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(t('support.fileTooLarge', { mb: MAX_FILE_MB }));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('subject', subject);
      fd.append('category', category);
      fd.append('message', message);
      if (file) fd.append('file', file);
      await api.post('/support/tickets', fd);
      setSubject('');
      setMessage('');
      setCategory('general');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success(t('support.ticketCreated'));
      qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
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
              <div className="flex flex-col gap-3 sm:flex-row">
                <input className="input flex-1" placeholder={t('support.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} required />
                <select className="input sm:w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`support.categories.${c}`)}</option>
                  ))}
                </select>
              </div>
              <textarea className="input min-h-28" placeholder={t('support.message')} value={message} onChange={(e) => setMessage(e.target.value)} required />
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-2">
                  <Paperclip size={16} /> {t('support.attachFile')}
                </button>
                <span className="text-[11px] text-white/35">{t('support.anyFileNote', { mb: MAX_FILE_MB })}</span>
                {file && (
                  <span className="flex min-w-0 items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70">
                    <FileText size={13} className="shrink-0 text-lav" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-white/40">{fmtBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => pickFile(null)}
                      className="text-white/40 hover:text-white"
                      aria-label={t('common.remove')}
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
              </div>
              <button className="btn-primary" disabled={busy}>{t('common.submit')}</button>
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
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left text-sm transition hover:bg-white/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{tk.subject}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
                      <span>{t(`support.categories.${tk.category}`, { defaultValue: tk.category })}</span>
                      <span>·</span>
                      <span>{new Date(tk.updatedAt).toLocaleString()}</span>
                      <span className="flex items-center gap-0.5"><MessageSquare size={11} /> {tk._count?.messages ?? 0}</span>
                    </span>
                  </span>
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
