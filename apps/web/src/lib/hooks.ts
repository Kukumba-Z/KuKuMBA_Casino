import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../store/auth';
import api from './api';
import { getSocket } from './socket';

export interface Currency {
  code: string;
  name: string;
  type: 'DEMO' | 'FIAT' | 'CRYPTO';
  symbol?: string;
  decimals: number;
  usdRate?: number; // value of 1 unit in USD — used to derive bet limits across currencies
  networks: string[];
  enabled: boolean;
}

export interface Balance {
  currency: string;
  mode: 'DEMO' | 'REAL';
  amount: string;
  locked: string;
}

export interface Game {
  key: string;
  name: string;
  type: string;
  category: string;
  provider: string;
  status: 'LIVE' | 'COMING_SOON';
  route: string | null;
  rtp: number;
  rtpPercent: number;
  thumbnail: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
}

export interface GameFilters {
  categories: { key: string; count: number }[];
  providers: { key: string; count: number }[];
}

/** Catalog list, optionally filtered. Pass an empty object for everything. */
export function useGames(filter: { category?: string; provider?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.category && filter.category !== 'ALL') params.set('category', filter.category);
  if (filter.provider && filter.provider !== 'ALL') params.set('provider', filter.provider);
  if (filter.q?.trim()) params.set('q', filter.q.trim());
  const qs = params.toString();
  return useQuery<Game[]>({
    queryKey: ['games', filter.category ?? 'ALL', filter.provider ?? 'ALL', filter.q ?? ''],
    queryFn: async () => (await api.get(`/games${qs ? `?${qs}` : ''}`)).data,
    staleTime: 30_000,
  });
}

export function useGameFilters() {
  return useQuery<GameFilters>({
    queryKey: ['game-filters'],
    queryFn: async () => (await api.get('/games/filters')).data,
    staleTime: 60_000,
  });
}

export interface AdminMe {
  role: string;
  isAdmin: boolean;
  permissions: string[];
}

/** The current operator's role + the capabilities they may use (gates the SPA). */
export function useAdminMe() {
  const authed = !!useAuth((s) => s.accessToken);
  return useQuery<AdminMe>({
    queryKey: ['admin-me'],
    enabled: authed,
    queryFn: async () => (await api.get('/admin/me')).data,
    staleTime: 60_000,
  });
}

/** Convenience: does the operator hold a permission (ADMIN ⇒ always). */
export function can(me: AdminMe | undefined, perm: string): boolean {
  return !!me && (me.isAdmin || me.permissions.includes(perm));
}

export function useCurrencies() {
  return useQuery<Currency[]>({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get('/wallet/currencies')).data,
    staleTime: 60_000,
  });
}

/** Map of VIP level → colour (from /vip/levels), used to tint usernames in chat. */
export function useVipColors() {
  return useQuery<Record<number, string>>({
    queryKey: ['vip-colors'],
    queryFn: async () => {
      const levels = (await api.get('/vip/levels')).data as { level: number; color?: string }[];
      const map: Record<number, string> = {};
      for (const l of levels) if (l.color) map[l.level] = l.color;
      return map;
    },
    staleTime: 300_000,
  });
}

export function useBalances() {
  const authed = !!useAuth((s) => s.accessToken);
  return useQuery<Balance[]>({
    queryKey: ['balances'],
    enabled: authed,
    queryFn: async () => (await api.get('/wallet/balances')).data,
    refetchInterval: 20_000,
  });
}

export function useMe() {
  const authed = !!useAuth((s) => s.accessToken);
  return useQuery({
    queryKey: ['me'],
    enabled: authed,
    queryFn: async () => (await api.get('/users/me')).data,
  });
}

export function useOnline() {
  const [online, setOnline] = useState<{ sockets: number; users: number }>({ sockets: 0, users: 0 });
  useEffect(() => {
    const s = getSocket();
    const handler = (d: any) => setOnline(d);
    s.on('online', handler);
    return () => {
      s.off('online', handler);
    };
  }, []);
  return online;
}

/** Pretty-print an amount, trimming trailing zeros. */
export function fmt(amount: string | number | undefined, maxDp = 8): string {
  if (amount === undefined || amount === null) return '0';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!isFinite(n)) return String(amount);
  const fixed = n.toFixed(Math.min(maxDp, 8));
  return fixed.replace(/\.?0+$/, '') || '0';
}
