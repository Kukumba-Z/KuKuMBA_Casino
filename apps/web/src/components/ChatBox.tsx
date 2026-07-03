import { MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../lib/api';
import { useVipBadges, useVipColors } from '../lib/hooks';
import { ROLE_TAGS, nameColor } from '../lib/roles';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { ChatUserPopover } from './ChatUserPopover';

interface Msg {
  id: string;
  userId?: string;
  accountId?: number;
  role?: string;
  vipLevel?: number;
  username: string;
  body: string;
  createdAt: string;
}

/** Short HH:MM timestamp so the room reads as alive. */
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function ChatBox({ className = '', onClose }: { className?: string; onClose?: () => void }) {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
  const { data: vipColors } = useVipColors();
  const { data: vipBadges } = useVipBadges();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sel, setSel] = useState<Msg | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/chat?limit=100').then((r) => setMessages(r.data)).catch(() => {});
    const s = getSocket();
    const onChat = (m: Msg) => setMessages((prev) => [...prev.slice(-99), m]);
    s.on('chat', onChat);
    return () => {
      s.off('chat', onChat);
    };
  }, []);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  // Pin to the bottom on new messages (scroll the list itself, not the window).
  useEffect(scrollToBottom, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    try {
      await api.post('/chat', { body });
    } catch (err) {
      // Muted/rejected messages must not vanish silently: explain and keep the text.
      toast.error(apiError(err));
      setText(body);
    }
  };

  return (
    // Solid (non-glass) panel — the chat should be fully opaque, not see-through.
    <div className={`flex min-h-0 flex-col rounded-3xl border border-white/10 bg-surface-2 shadow-card ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-bold">
        <MessageCircle size={16} className="text-lav" /> {t('chat.title')}
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {messages.map((m) => {
          const tag = m.role ? ROLE_TAGS[m.role] : undefined;
          const badge = m.vipLevel != null ? vipBadges?.[m.vipLevel] : undefined;
          return (
            <div key={m.id} className="text-sm leading-snug">
              <span className="mr-1 text-[11px] tabular-nums text-white/30">{hhmm(m.createdAt)}</span>
              <button
                type="button"
                onClick={() => setSel(m)}
                className="font-semibold hover:underline"
                style={{ color: nameColor({ role: m.role, vipLevel: m.vipLevel }, vipColors) }}
              >
                {badge?.icon && (
                  <span className="mr-0.5" title={`${badge.name} · VIP ${badge.level}`}>{badge.icon}</span>
                )}
                {m.username}
              </button>
              {tag && (
                <span className="ml-1 rounded bg-white/10 px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-white/55">
                  {tag}
                </span>
              )}
              <span className="text-white/30">:</span>{' '}
              <span className="break-words text-white/80">{m.body}</span>
            </div>
          );
        })}
      </div>
      {authed ? (
        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setTimeout(scrollToBottom, 300)}
            maxLength={500}
            placeholder={t('chat.placeholder')}
            className="input !py-2"
          />
          <button className="btn-primary grid !px-3 !py-2 place-items-center" aria-label={t('common.submit')}>
            <Send size={16} />
          </button>
        </form>
      ) : (
        <div className="border-t border-white/10 p-3 text-center text-xs text-white/40">
          {t('chat.signIn')}
        </div>
      )}

      {sel && <ChatUserPopover user={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
