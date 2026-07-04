import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Mode = 'DEMO' | 'REAL';

interface UIState {
  /** Which account these per-account prefs belong to (accountId as string). */
  owner: string | null;
  mode: Mode;
  currency: string; // active currency for the selected mode
  sound: boolean; // game sound effects on/off (shared by all games)
  quick: boolean; // "quick play": resolve spins instantly, no animation (all games)
  liveBets: boolean; // show the lobby's live-bets ticker
  setMode: (mode: Mode) => void;
  setCurrency: (currency: string) => void;
  toggleSound: () => void;
  toggleQuick: () => void;
  toggleLiveBets: () => void;
  claim: (userId: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      owner: null,
      mode: 'DEMO',
      currency: 'DEMO',
      sound: true,
      quick: false,
      liveBets: true,
      setMode: (mode) =>
        set((s) => ({
          mode,
          // DEMO mode always uses the DEMO currency; switching to REAL defaults to USD
          currency: mode === 'DEMO' ? 'DEMO' : s.currency === 'DEMO' ? 'USD' : s.currency,
        })),
      setCurrency: (currency) => set({ currency }),
      toggleSound: () => set((s) => ({ sound: !s.sound })),
      toggleQuick: () => set((s) => ({ quick: !s.quick })),
      toggleLiveBets: () => set((s) => ({ liveBets: !s.liveBets })),
      // Per-ACCOUNT prefs (quick play, wallet mode/currency) must not follow a
      // different user who signs in on the same device — reset them when the
      // account changes. Device prefs (sound, ticker) survive.
      claim: (userId) =>
        set((s) => (s.owner === userId ? {} : { owner: userId, quick: false, mode: 'DEMO', currency: 'DEMO' })),
    }),
    { name: 'kukumba-ui' },
  ),
);
