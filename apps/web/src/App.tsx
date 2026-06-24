import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { reconnectSocket } from './lib/socket';
import { useAuth } from './store/auth';

import AdminPage from './pages/Admin';
import AuthPage from './pages/Auth';
import Bonuses from './pages/Bonuses';
import Cashback from './pages/Cashback';
import Lobby from './pages/Lobby';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Promo from './pages/Promo';
import RaffleDetail from './pages/RaffleDetail';
import Raffles from './pages/Raffles';
import Roulette from './pages/Roulette';
import StaticPage from './pages/StaticPage';
import Support from './pages/Support';
import Vip from './pages/Vip';
import Wallet from './pages/Wallet';
import Referrals from './pages/Referrals';

function RequireAuth({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { accessToken, user } = useAuth();
  const location = useLocation();
  if (!accessToken) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const accessToken = useAuth((s) => s.accessToken);
  // refresh the socket auth whenever the session changes
  useEffect(() => {
    reconnectSocket();
  }, [accessToken]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Lobby />} />
        <Route path="/roulette" element={<Roulette />} />
        <Route path="/raffles" element={<Raffles />} />
        <Route path="/raffles/:id" element={<RaffleDetail />} />
        <Route path="/bonuses" element={<Bonuses />} />
        <Route path="/vip" element={<Vip />} />
        <Route path="/support" element={<Support />} />
        <Route path="/page/:key" element={<StaticPage />} />

        <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="/promo" element={<RequireAuth><Promo /></RequireAuth>} />
        <Route path="/referrals" element={<RequireAuth><Referrals /></RequireAuth>} />
        <Route path="/cashback" element={<RequireAuth><Cashback /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
      </Route>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
