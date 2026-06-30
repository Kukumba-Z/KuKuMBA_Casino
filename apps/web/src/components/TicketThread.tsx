import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Paperclip, Send, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { enumLabel } from '../lib/labels';
import { isStaff } from '../lib/roles';
import { statusClass } from '../lib/status';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { StatusChip } from './StatusChip';

const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

// Meaningful transitions an operator makes by hand. ANSWERED/PENDING are set
// automatically on reply, so they're not manual buttons. "Open" = reopen.
const ADMIN_STATUSES = ['OPEN', 'RESOLVED', 'CLOSED'] as const;

// A resolved/closed ticket is locked for the player (they can't reopen by
// writing) — they open a new ticket instead. Staff can still reply (reopens).
const LOCKED_FOR_USER = ['RESOLVED', 'CLOSED'];

/**
 * Shared support-ticket conversation: message list + attachments + a reply
 * composer (photo/video). Used by both the player view (`base="/support"`) and
 * the admin panel (`base="/admin"`, with status controls). Endpoints are
 * identical in shape, so one component drives both surfaces.
 */
export function TicketThread({
  ticketId,
  base,
  admin = false,
  onChanged,
}: {
  ticketId: string;
  base: string; // "/support" or "/admin"
  admin?: boolean;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const myId = useAuth((s) => s.user?.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const key = ['ticket', base, ticketId];
  const { data: ticket, isLoading } = useQuery({ queryKey: key, queryFn: async () => (await api.get(`${base}/tickets/${ticketId}`)).data });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    onChanged?.();
  };

  const reply = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (text.trim()) fd.append('body', text.trim());
      if (file) fd.append('file', file);
      return (await api.post(`${base}/tickets/${ticketId}/reply`, fd)).data;
    },
    onSuccess: () => {
      setText('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => (await api.patch(`${base}/tickets/${ticketId}/status`, { status })).data,
    onSuccess: () => {
      refresh();
      toast.success(t('support.statusUpdated'));
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading || !ticket) return <div className="py-8 text-center text-white/50">{t('common.loading')}</div>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    reply.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-white/60">
        <StatusChip category="ticketStatus" value={ticket.status} />
        {/* Priority is staff triage — hidden from the player, where it's meaningless. */}
        {admin && <StatusChip category="ticketPriority" value={ticket.priority} prefix={t('support.priority')} />}
        {admin && ticket.user && (
          <span className="text-white/50">
            {ticket.user.username} #{ticket.user.accountId}
          </span>
        )}
      </div>

      {admin && (
        <div className="flex flex-wrap gap-1.5">
          {ADMIN_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus.mutate(s)}
              disabled={setStatus.isPending || ticket.status === s}
              className={`rounded-xl border px-3 py-1.5 text-xs transition disabled:opacity-60 ${ticket.status === s ? statusClass('ticketStatus', s) : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}
            >
              {enumLabel('ticketStatus', s)}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
        {(ticket.messages ?? []).map((m: any) => {
          // "mine" hugs the right: the player's own messages, or staff messages in admin view.
          const staff = isStaff(m.authorRole);
          const mine = admin ? staff : m.authorId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? 'bg-lav/20' : 'bg-white/[0.05]'}`}>
                <div className="mb-1 flex items-center gap-2 text-[11px] text-white/40">
                  <span>{enumLabel('role', m.authorRole)}</span>
                  <span>·</span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.attachmentUrl &&
                  (isVideo(m.attachmentUrl) ? (
                    <video src={m.attachmentUrl} controls className="mt-2 max-h-64 w-full rounded-xl" />
                  ) : (
                    <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
                      <img src={m.attachmentUrl} alt="" className="mt-2 max-h-64 rounded-xl" />
                    </a>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {!admin && LOCKED_FOR_USER.includes(ticket.status) ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-white/50">
          <Lock size={15} /> {t('support.lockedNote')}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
        <textarea
          className="input min-h-20"
          placeholder={t('support.replyPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {file && (
          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/70">
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className="ml-2 text-white/50 hover:text-white"
              aria-label={t('common.remove')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-2" aria-label={t('support.attach')}>
            <Paperclip size={16} />
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={reply.isPending || (!text.trim() && !file)}>
            <Send size={16} /> {t('support.send')}
          </button>
        </div>
        </form>
      )}
    </div>
  );
}
