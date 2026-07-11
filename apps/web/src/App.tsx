import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Toaster } from './components/Toaster';
import { isStaff } from './lib/roles';
import { reconnectSocket } from './lib/socket';
import { useAuth } from './store/auth';

import AdminPage from './pages/admin';
import AuthPage from './pages/Auth';
import Bonuses from './pages/Bonuses';
import Crash from './pages/Crash';
import Games from './pages/Games';
import Lobby from './pages/Lobby';
import Mines from './pages/Mines';
import Notifications from './pages/Notifications';
import Plinko from './pages/Plinko';
import Ponyjack from './pages/Ponyjack';
import Profile from './pages/Profile';
import RaffleDetail from './pages/RaffleDetail';
import Raffles from './pages/Raffles';
import Roulette from './pages/Roulette';
import Sexcoin from './pages/Sexcoin';
import StaticPage from './pages/StaticPage';
import Support from './pages/Support';
import Top from './pages/Top';
import Upgrader from './pages/Upgrader';
import Wallet from './pages/Wallet';

function RequireAuth({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { accessToken, user } = useAuth();
  const location = useLocation();
  if (!accessToken) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && !isStaff(user?.role)) return <Navigate to="/" replace />;
  return children;
}

/** Reset scroll to the top on every navigation (fixes pages opening scrolled). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  const accessToken = useAuth((s) => s.accessToken);
  useEffect(() => {
    reconnectSocket();
  }, [accessToken]);

  return (
    <>
      <ScrollToTop />
      <Toaster />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Lobby />} />
          <Route path="/games" element={<Games />} />
          <Route path="/roulette" element={<Roulette />} />
          <Route path="/crash" element={<Crash />} />
          <Route path="/ponyjack" element={<Ponyjack />} />
          <Route path="/plinko" element={<Plinko />} />
          <Route path="/upgrader" element={<Upgrader />} />
          <Route path="/mines" element={<Mines />} />
          <Route path="/sexcoin" element={<Sexcoin />} />
          <Route path="/top" element={<Top />} />
          <Route path="/raffles" element={<Raffles />} />
          <Route path="/raffles/:id" element={<RaffleDetail />} />
          {/* Bonuses hub holds cashback / promo / vip / referrals as tabs (members only) */}
          <Route path="/bonuses" element={<RequireAuth><Bonuses /></RequireAuth>} />
          <Route path="/cashback" element={<Navigate to="/bonuses?tab=cashback" replace />} />
          <Route path="/rakeback" element={<Navigate to="/bonuses?tab=rakeback" replace />} />
          <Route path="/promo" element={<Navigate to="/bonuses?tab=promo" replace />} />
          <Route path="/vip" element={<Navigate to="/bonuses?tab=vip" replace />} />
          <Route path="/referrals" element={<Navigate to="/bonuses?tab=referrals" replace />} />
          <Route path="/support" element={<Support />} />
          <Route path="/page/:key" element={<StaticPage />} />

          <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
        </Route>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
