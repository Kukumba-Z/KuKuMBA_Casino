import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Mode = 'DEMO' | 'REAL';

interface UIState {
  mode: Mode;
  currency: string; // active currency for the selected mode
  sound: boolean; // game sound effects on/off (shared by all games)
  liveBets: boolean; // show the lobby's live-bets ticker
  setMode: (mode: Mode) => void;
  setCurrency: (currency: string) => void;
  toggleSound: () => void;
  toggleLiveBets: () => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      mode: 'DEMO',
      currency: 'DEMO',
      sound: true,
      liveBets: true,
      setMode: (mode) =>
        set((s) => ({
          mode,
          // DEMO mode always uses the DEMO currency; switching to REAL defaults to USD
          currency: mode === 'DEMO' ? 'DEMO' : s.currency === 'DEMO' ? 'USD' : s.currency,
        })),
      setCurrency: (currency) => set({ currency }),
      toggleSound: () => set((s) => ({ sound: !s.sound })),
      toggleLiveBets: () => set((s) => ({ liveBets: !s.liveBets })),
    }),
    { name: 'kukumba-ui' },
  ),
);
