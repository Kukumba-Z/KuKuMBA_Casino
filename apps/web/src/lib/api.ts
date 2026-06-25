import axios from 'axios';
import i18n from '../i18n';
import { useAuth } from '../store/auth';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const rt = useAuth.getState().refreshToken;
  if (!rt) {
    useAuth.getState().clear();
    return null;
  }
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken: rt });
    useAuth.getState().setTokens(data.accessToken, data.refreshToken, data.user);
    return data.accessToken as string;
  } catch {
    useAuth.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const token = await (refreshing ??= doRefresh());
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Turn a backend error into a friendly, localized message.
 * Backend returns stable codes (ACCOUNT_BANNED, INSUFFICIENT_FUNDS, …) which we
 * map to nice text; class-validator messages are already human and shown as-is;
 * unmapped raw codes fall back to a generic message (never shown to the user).
 */
export function apiError(e: any): string {
  if (e && !e.response && e.request) return i18n.t('errors.NETWORK');
  let m = e?.response?.data?.message;
  if (Array.isArray(m)) m = m[0];
  const text = String(m ?? '').trim();
  if (!text) return i18n.t('errors.GENERIC');
  const key = text.split(':')[0];
  if (i18n.exists(`errors.${key}`)) return i18n.t(`errors.${key}`);
  // looks like a raw CODE we didn't map → don't leak it to the user
  if (/^[A-Z0-9_]+(:[A-Za-z0-9_]+)?$/.test(text)) return i18n.t('errors.GENERIC');
  return text;
}

export default api;
