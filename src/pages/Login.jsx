import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, inviteCode);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-word">COREZ</span>
          <span className="auth-logo-sub">Sign in to continue</span>
        </div>

        <div className="auth-tabs">
          <button className={mode==='login'?'active':''} onClick={()=>{setMode('login'); setError('');}}>Login</button>
          <button className={mode==='signup'?'active':''} onClick={()=>{setMode('signup'); setError('');}}>Sign Up</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@corez.pro" required autoComplete="email" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} />
          </label>
          {mode==='signup' && (
            <label>
              <span>Invite Code</span>
              <input type="text" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="COREZ-INVITE-2026" required />
              <small className="auth-hint">Invite-only — ask an admin for a code.</small>
            </label>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode==='login' ? 'Login' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button className="auth-google" onClick={googleLogin} type="button">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C34.7 32.1 29.9 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.7 0 5.2.9 7.2 2.5l6-6C33.5 5.1 28.9 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20.5-7.5 20.5-21 0-1.4-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c2.7 0 5.2.9 7.2 2.5l6-6C33.5 5.1 28.9 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.8 0 11-1.9 14.7-5.2l-6.7-5.2C30 36.3 27.1 37.5 24 37.5c-5.9 0-10.9-3.9-12.7-9.2l-6.6 5.1C7.9 40.6 15.4 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.6 5.7-6.7 7.1l6.7 5.2c-.5.5 4.2-3.1 4.2-10.3 0-1-.1-2-.4-2.9z"/></svg>
          Continue with Google
        </button>

        <p className="auth-foot">
          {mode==='login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="auth-link" onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Sign up':'Login'}</button>
        </p>
      </div>
    </div>
  );
}
