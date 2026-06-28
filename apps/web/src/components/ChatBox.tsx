import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
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

export function ChatBox({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
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
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`card flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-bold">
        <MessageCircle size={16} className="text-lav" /> {t('chat.title')}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm leading-snug">
            <span className="mr-1 text-[11px] tabular-nums text-white/30">{hhmm(m.createdAt)}</span>
            <button
              type="button"
              onClick={() => setSel(m)}
              className="font-semibold text-lav hover:underline"
            >
              {m.username}
            </button>
            <span className="text-white/30">:</span>{' '}
            <span className="break-words text-white/80">{m.body}</span>
          </div>
        ))}
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
