import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Mascot';
import api, { apiError } from '../lib/api';
import { useAuth } from '../store/auth';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setTokens = useAuth((s) => s.setTokens);

  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState(params.get('ref') || '');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register') {
        if (!agree) throw new Error(t('auth.agree'));
        const { data } = await api.post('/auth/register', { email, username, password, refCode: refCode || undefined });
        setTokens(data.accessToken, data.refreshToken, data.user);
      } else {
        const { data } = await api.post('/auth/login', { login, password });
        setTokens(data.accessToken, data.refreshToken, data.user);
      }
      navigate('/');
    } catch (e: any) {
      setErr(e?.response ? apiError(e) : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-night px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex justify-center">
          <Logo />
        </Link>
        <form onSubmit={submit} className="card animate-fadeup space-y-4 p-7">
          <h1 className="text-center text-2xl font-extrabold">
            {mode === 'login' ? t('auth.welcome') : t('auth.create')}
          </h1>

          {mode === 'register' ? (
            <>
              <div>
                <label className="label">{t('auth.email')}</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">{t('auth.username')}</label>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
              </div>
            </>
          ) : (
            <div>
              <label className="label">{t('auth.loginField')}</label>
              <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />
            </div>
          )}

          <div>
            <label className="label">{t('auth.password')}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="label">{t('auth.refCode')}</label>
                <input className="input" value={refCode} onChange={(e) => setRefCode(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-lav" />
                {t('auth.agree')}
              </label>
            </>
          )}

          {err && <div className="rounded-xl bg-roul-red/15 px-3 py-2 text-sm text-roul-red">{err}</div>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? '…' : mode === 'login' ? t('common.login') : t('common.register')}
          </button>

          <div className="text-center text-sm text-white/50">
            {mode === 'login' ? (
              <>
                {t('auth.noAccount')}{' '}
                <Link to="/register" className="text-lav hover:underline">
                  {t('common.register')}
                </Link>
              </>
            ) : (
              <>
                {t('auth.haveAccount')}{' '}
                <Link to="/login" className="text-lav hover:underline">
                  {t('common.login')}
                </Link>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
