import { useChat } from '../store/chat';
import { ChatBox } from './ChatBox';

/**
 * Global chat as a toggleable overlay, so players can open it on top of a game
 * (e.g. roulette) without navigating away and losing their bets.
 *
 * It deliberately sits *below* the nav bars (z-30 vs the bars' z-40): the same
 * Chat button that opens the drawer therefore stays clickable to toggle it shut.
 * Tapping the backdrop or the × also closes it.
 */
export function ChatDrawer() {
  const { open, close } = useChat();
  return (
    <div className={`fixed inset-0 z-30 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      {/* Mobile: a panel between the header and bottom nav. Desktop: a right sidebar. */}
      <div
        className={`absolute px-3 transition-all duration-200
          inset-x-0 bottom-16 top-16
          lg:inset-x-auto lg:left-auto lg:right-0 lg:top-16 lg:bottom-0 lg:w-[400px] lg:px-0
          ${open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      >
        <div className="mx-auto flex h-full max-w-lg flex-col lg:max-w-none lg:py-3 lg:pr-3">
          {/* Close lives inside the chat header now (top-right), not floating above it. */}
          <ChatBox className="min-h-0 flex-1" onClose={close} />
        </div>
      </div>
    </div>
  );
}
