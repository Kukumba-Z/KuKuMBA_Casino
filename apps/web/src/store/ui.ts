import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Mode = 'DEMO' | 'REAL';

interface UIState {
  mode: Mode;
  currency: string; // active currency for the selected mode
  setMode: (mode: Mode) => void;
  setCurrency: (currency: string) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      mode: 'DEMO',
      currency: 'DEMO',
      setMode: (mode) =>
        set((s) => ({
          mode,
          // DEMO mode always uses the DEMO currency; switching to REAL keeps a sensible default
          currency: mode === 'DEMO' ? 'DEMO' : s.currency === 'DEMO' ? 'USDT' : s.currency,
        })),
      setCurrency: (currency) => set({ currency }),
    }),
    { name: 'kukumba-ui' },
  ),
);
