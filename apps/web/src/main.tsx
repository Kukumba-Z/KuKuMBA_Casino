import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './index.css';
import { useAuth } from './store/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
});

// Cached data must never survive an account switch in the same tab: another
// user's balances, tickets or admin permissions (['admin-me'] gates moderation
// buttons) would otherwise leak into the new session until they went stale.
let lastUserId = useAuth.getState().user?.id ?? null;
useAuth.subscribe((s) => {
  const id = s.user?.id ?? null;
  if (id !== lastUserId) {
    lastUserId = id;
    queryClient.clear();
  }
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
