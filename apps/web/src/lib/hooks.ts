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
  networks: string[];
  enabled: boolean;
}

export interface Balance {
  currency: string;
  mode: 'DEMO' | 'REAL';
  amount: string;
  locked: string;
}

export function useCurrencies() {
  return useQuery<Currency[]>({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get('/wallet/currencies')).data,
    staleTime: 60_000,
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
