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
  const [plan, setPlan] = useState('free');
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
        await signup(email, password, plan);
        // For paid plans, create monthly subscription via Ziina and redirect to checkout
        if (plan === 'standard' || plan === 'premium') {
          try {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://corez.pro';
            const payRes = await fetch('/api/subscriptions/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                plan,
                success_url: origin + '/payment/success?plan=' + plan,
                cancel_url: origin + '/payment/cancel?plan=' + plan,
                test: false
              })
            });
            const payData = await payRes.json().catch(() => ({}));
            if (payRes.ok && payData.redirect_url) {
              window.location.href = payData.redirect_url;
              return;
            } else if (payData.free) {
              // Free handled — no redirect
            } else if (!payRes.ok) {
              console.warn('Subscription checkout failed', payData);
              // Still let signup succeed — user can pay later from settings
              setError(payData.error || 'Payment setup failed — you can upgrade later from settings.');
            }
          } catch (payErr) {
            console.warn('Payment redirect failed', payErr);
          }
        }
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '11px', color: 'var(--text-secondary)' }}>Choose Plan</span>
              <div role="radiogroup" aria-label="Choose plan" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {[
                  { id: 'free', name: 'Free', price: '0 AED', sub: 'forever', desc: 'Get started', features: 'Limited generations' },
                  { id: 'standard', name: 'Standard', price: '18.36 AED', sub: '/ month', desc: 'Most popular', features: 'More builds & publish' },
                  { id: 'premium', name: 'Premium', price: '27.54 AED', sub: '/ month', desc: 'Full power', features: 'Unlimited & priority' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={plan === p.id}
                    onClick={() => setPlan(p.id)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '10px',
                      border: plan === p.id ? '1.5px solid var(--text-primary)' : '1px solid var(--border-color)',
                      background: plan === p.id ? 'var(--bg-tertiary)' : 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    {plan === p.id && <span style={{ position: 'absolute', top: '6px', right: '6px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-primary)' }} />}
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '4px', color: plan === p.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{p.price}<span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}> {p.sub}</span></div>
                    <div style={{ fontSize: '10px', marginTop: '2px', color: 'var(--text-muted)' }}>{p.features}</div>
                  </button>
                ))}
              </div>
              <small className="auth-hint" style={{ textAlign: 'center' }}>
                {plan === 'free' ? 'Free forever — upgrade anytime.' : plan === 'standard' ? 'Standard — 18.36 AED / month via Ziina. Renewed monthly, cancel anytime.' : 'Premium — 27.54 AED / month via Ziina. Renewed monthly, cancel anytime.'}
              </small>
            </div>
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
