import { create } from 'zustand';

/**
 * Global chat-drawer open/close state. Shared by the nav Chat button (which
 * toggles it) and the ChatDrawer overlay, so chat can open on top of any page
 * (e.g. a game) without navigating away.
 */
interface ChatUI {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useChat = create<ChatUI>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
