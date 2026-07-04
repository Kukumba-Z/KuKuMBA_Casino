import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './index.css';
import { useAuth } from './store/auth';
import { useChat } from './store/chat';
import { useUI } from './store/ui';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
});

// Cached data must never survive an account switch in the same tab: another
// user's balances, tickets or admin permissions (['admin-me'] gates moderation
// buttons) would otherwise leak into the new session until they went stale.
// Persisted per-account UI prefs (quick play, wallet mode/currency) are claimed
// by the signed-in account for the same reason.
let lastUserId = useAuth.getState().user?.id ?? null;
if (lastUserId) useUI.getState().claim(lastUserId);
useAuth.subscribe((s) => {
  const id = s.user?.id ?? null;
  if (id !== lastUserId) {
    lastUserId = id;
    queryClient.clear();
    useChat.getState().close();
    if (id) useUI.getState().claim(id);
  }
});

// Cross-tab sync: a logout or account switch performed in ANOTHER tab must
// apply here immediately, not on the next 401. The storage event fires only
// in the tabs that did NOT write, so rehydrating from localStorage converges
// every open tab on the latest session; the subscription above then runs the
// usual cleanup (query cache, chat overlay, per-account UI prefs, socket).
window.addEventListener('storage', (e) => {
  if (e.key === 'kukumba-auth') void useAuth.persist.rehydrate();
  if (e.key === 'kukumba-ui') void useUI.persist.rehydrate();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
