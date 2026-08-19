import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import mercuryBg from '../../assets/Mercury_5.jpeg';

export default function Login() {
  const { login, signup, forgot, reset } = useAuth();
  const [mode, setMode] = useState(() => {
    // If URL has ?token=... prefill reset mode (from email link)
    try {
      const t = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('token');
      return t ? 'reset' : 'login';
    } catch { return 'login'; }
  }); // 'login' | 'signup' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState('');
  const [resetToken, setResetToken] = useState(() => {
    try { return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('token') || ''; } catch { return ''; }
  });
  const [newPassword, setNewPassword] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'signup') {
        await signup(email, password, inviteCode);
      } else if (mode === 'forgot') {
        const res = await forgot(email);
        setForgotSent(res.message || 'If that email exists, a reset link has been sent.');
        // In dev without RESEND, token is returned - prefill for testing
        if (res.token) setResetToken(res.token);
      } else if (mode === 'reset') {
        await reset(resetToken, newPassword);
        setError('');
        setForgotSent('Password has been reset. You can now login.');
        setMode('login');
        setNewPassword('');
        setResetToken('');
        // clear token from URL
        try { window.history.replaceState({}, '', window.location.pathname); } catch {}
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" style={{ backgroundImage: `url(${mercuryBg})` }} aria-hidden="true" />
      <div className="auth-bg-overlay" aria-hidden="true" />
      <div className="auth-center">
        <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-word">COREZ</span>
          <span className="auth-logo-sub">
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Set a new password'}
          </span>
        </div>

        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs" role="tablist" aria-label="Authentication modes">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => { setMode('login'); setError(''); setForgotSent(''); }}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => { setMode('signup'); setError(''); setForgotSent(''); }}
            >
              Sign Up
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@corez.pro"
                required
                autoComplete="email"
                autoFocus={mode !== 'reset'}
              />
            </label>
          )}

          {(mode === 'login' || mode === 'signup') && (
            <label>
              <span>Password</span>
              <div className="auth-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                </button>
              </div>
            </label>
          )}

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: '-6px' }}>
              <button type="button" className="auth-link" style={{ fontSize: '12px' }} onClick={() => { setMode('forgot'); setError(''); setForgotSent(''); }}>
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'signup' && (
            <label>
              <span>Invite Code</span>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder=""
                required
                autoComplete="off"
                spellCheck="false"
              />
              <small className="auth-hint">Enter your invite code to continue.</small>
            </label>
          )}

          {mode === 'reset' && (
            <>
              <label>
                <span>New Password</span>
                <div className="auth-password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                </div>
              </label>
            </>
          )}

          {forgotSent && (
            <div className="auth-error" role="status" style={{ background: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)', color: '#86efac' }}>
              {forgotSent}
            </div>
          )}
          {error && (
            <div className="auth-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Login' : mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Send reset link' : 'Reset password'}
          </button>
        </form>

        <p className="auth-foot">
          {mode === 'forgot' ? (
            <>
              Remembered? <button type="button" className="auth-link" onClick={() => { setMode('login'); setError(''); setForgotSent(''); }}>Back to login</button>
            </>
          ) : mode === 'reset' ? (
            <>
              <button type="button" className="auth-link" onClick={() => { setMode('login'); setError(''); setForgotSent(''); }}>Back to login</button>
              <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>·</span>
              <button type="button" className="auth-link" onClick={() => { setMode('forgot'); setError(''); }}>Resend email</button>
            </>
          ) : mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          {(mode === 'login' || mode === 'signup') && (
            <button
              type="button"
              className="auth-link"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setForgotSent(''); }}
            >
              {mode === 'login' ? 'Sign up' : 'Login'}
            </button>
          )}
        </p>
        </div>
      </div>
    </div>
  );
}
