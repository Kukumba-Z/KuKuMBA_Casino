import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';

interface Msg {
  id: string;
  username: string;
  body: string;
  createdAt: string;
}

export function ChatBox({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const authed = !!useAuth((s) => s.accessToken);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/chat?limit=40').then((r) => setMessages(r.data));
    const s = getSocket();
    const onChat = (m: Msg) => setMessages((prev) => [...prev.slice(-60), m]);
    s.on('chat', onChat);
    return () => {
      s.off('chat', onChat);
    };
  }, []);

  // Pin the message list to the bottom by scrolling the list container itself.
  // (scrollIntoView would scroll every ancestor — including the window — which
  // on mobile yanks the whole page down to the chat on load.)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
    <div className={`card flex flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-bold">
        <MessageCircle size={16} className="text-lav" /> {t('chat.title')}
      </div>
      <div ref={listRef} className="min-h-[320px] flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-semibold text-lav">{m.username}</span>{' '}
            <span className="break-words text-white/80">{m.body}</span>
          </div>
        ))}
      </div>
      {authed ? (
        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
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
    </div>
  );
}
