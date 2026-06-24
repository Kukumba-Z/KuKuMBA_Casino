import { useEffect, useRef, useState } from 'react';
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
  const authed = !!useAuth((s) => s.accessToken);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/chat?limit=40').then((r) => setMessages(r.data));
    const s = getSocket();
    const onChat = (m: Msg) => setMessages((prev) => [...prev.slice(-60), m]);
    s.on('chat', onChat);
    return () => {
      s.off('chat', onChat);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <div className="border-b border-white/10 px-4 py-3 text-sm font-bold">💬 Чат · Chat</div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" style={{ maxHeight: 360 }}>
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-semibold text-lav">{m.username}</span>{' '}
            <span className="text-white/80">{m.body}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {authed ? (
        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Сообщение…"
            className="input !py-2"
          />
          <button className="btn-primary !px-3 !py-2">➤</button>
        </form>
      ) : (
        <div className="border-t border-white/10 p-3 text-center text-xs text-white/40">
          Войдите, чтобы писать в чат
        </div>
      )}
    </div>
  );
}
