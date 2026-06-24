import axios from 'axios';
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

/** Pull a readable error message out of an axios error. */
export function apiError(e: any): string {
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(', ');
  return m || e?.message || 'Error';
}

export default api;
