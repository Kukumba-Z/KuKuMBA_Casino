import { MessagesSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatBox } from '../components/ChatBox';

/** Global chat, now a first-class page reached from the bottom-nav Chat tab. */
export default function Chat() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-extrabold">
        <MessagesSquare size={22} className="text-lav" />
        <span className="holo-text">{t('nav.chat')}</span>
      </h1>
      {/* sized container so the message list fills the screen height */}
      <ChatBox className="h-[calc(100vh-13rem)] lg:h-[calc(100vh-11rem)]" />
    </div>
  );
}
