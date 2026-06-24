import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  accountId: number;
  username: string;
  email: string;
  role: string;
  locale: string;
  kycStatus: string;
  vipLevel: number;
  referralCode: string;
  avatarUrl?: string | null;
  twoFactorEnabled?: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setTokens: (access: string, refresh: string, user?: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh, user) =>
        set((s) => ({ accessToken: access, refreshToken: refresh, user: user ?? s.user })),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'kukumba-auth' },
  ),
);
