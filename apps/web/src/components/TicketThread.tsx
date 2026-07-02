import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Lock, Paperclip, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { enumLabel } from '../lib/labels';
import { isStaff } from '../lib/roles';
import { statusClass } from '../lib/status';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { StatusChip } from './StatusChip';

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_RE = /\.(mp4|webm|mov)$/i;

/** Client-side cap mirroring the server's UPLOADS_MAX_FILE_MB (50 MB). */
const MAX_FILE_MB = 50;

// Meaningful transitions an operator makes by hand. ANSWERED/PENDING are set
// automatically on reply, so they're not manual buttons. "Open" = reopen.
const ADMIN_STATUSES = ['OPEN', 'RESOLVED', 'CLOSED'] as const;

// A resolved/closed ticket is locked for the player (they can't reopen by
// writing) — they open a new ticket instead. Staff can still reply (reopens).
const LOCKED_FOR_USER = ['RESOLVED', 'CLOSED'];

/** "1.4 МБ" / "512 КБ" — compact human size for attachment chips. */
export function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Attachment renderer: media previews inline, everything else a download chip. */
function Attachment({ url, name, size }: { url: string; name?: string | null; size?: number | null }) {
  const download = `${url}?name=${encodeURIComponent(name || '')}`;
  if (VIDEO_RE.test(url)) return <video src={url} controls className="mt-2 max-h-64 w-full rounded-xl" />;
  if (IMAGE_RE.test(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={name ?? ''} className="mt-2 max-h-64 rounded-xl" />
      </a>
    );
  }
  return (
    <a
      href={download}
      className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/80 transition hover:bg-black/40"
    >
      <FileText size={16} className="shrink-0 text-lav" />
      <span className="min-w-0 flex-1 truncate">{name || url.split('/').pop()}</span>
      {size ? <span className="shrink-0 text-white/40">{fmtBytes(size)}</span> : null}
    </a>
  );
}

/**
 * Shared support-ticket conversation: message list + attachments + a reply
 * composer (any file up to 50 MB). Used by both the player view
 * (`base="/support"`) and the admin panel (`base="/admin"`, with status
 * controls). Endpoints are identical in shape, so one component drives both.
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
  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const key = ['ticket', base, ticketId];
  const { data: ticket, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get(`${base}/tickets/${ticketId}`)).data,
    // Live conversation: pick up the other side's replies without reopening.
    refetchInterval: 10_000,
  });

  // Keep the newest message in view as the thread grows.
  const msgCount = ticket?.messages?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    onChanged?.();
  };

  const pickFile = (f: File | null) => {
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(t('support.fileTooLarge', { mb: MAX_FILE_MB }));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setFile(f);
  };

  const reply = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (text.trim()) fd.append('body', text.trim());
      if (file) fd.append('file', file);
      return (
        await api.post(`${base}/tickets/${ticketId}/reply`, fd, {
          onUploadProgress: (e) => {
            if (file && e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        })
      ).data;
    },
    onSuccess: () => {
      setText('');
      setFile(null);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    },
    onError: (e) => {
      setProgress(null);
      toast.error(apiError(e));
    },
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
        <span className="min-w-0 flex-1 truncate font-semibold text-white/85">{ticket.subject}</span>
        <StatusChip category="ticketStatus" value={ticket.status} />
        {/* Priority is staff triage — hidden from the player, where it's meaningless. */}
        {admin && <StatusChip category="ticketPriority" value={ticket.priority} prefix={t('support.priority')} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
        <span>{t(`support.categories.${ticket.category}`, { defaultValue: ticket.category })}</span>
        <span>·</span>
        <span>{new Date(ticket.createdAt).toLocaleString()}</span>
        {admin && ticket.user && (
          <>
            <span>·</span>
            <span>{ticket.user.username} #{ticket.user.accountId}</span>
          </>
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

      <div ref={listRef} className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
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
                {m.attachmentUrl && <Attachment url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} />}
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
            <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/70">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText size={14} className="shrink-0 text-lav" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-white/40">{fmtBytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  className="ml-2 shrink-0 text-white/50 hover:text-white"
                  aria-label={t('common.remove')}
                >
                  <X size={15} />
                </button>
              </div>
              {progress != null && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-lav transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-ghost px-3 py-2"
              aria-label={t('support.attach')}
              title={t('support.anyFileNote', { mb: MAX_FILE_MB })}
            >
              <Paperclip size={16} />
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={reply.isPending || (!text.trim() && !file)}>
              <Send size={16} /> {reply.isPending && progress != null ? `${progress}%` : t('support.send')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
