import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import mercuryBg from '../../assets/Mercury_5.jpeg';

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password, inviteCode);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pageRef = useRef(null);
  const bgRef = useRef(null);

  useEffect(() => {
    const page = pageRef.current;
    const bg = bgRef.current;
    if (!page || !bg) return;
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const onMove = (e) => {
      const rect = page.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = x * 28;
      targetY = y * 28;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      bg.style.transform = `translate3d(${curX}px, ${curY}px, 0) scale(1.08)`;
      if (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    page.addEventListener('mousemove', onMove);
    page.addEventListener('mouseleave', onLeave);
    return () => {
      page.removeEventListener('mousemove', onMove);
      page.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="auth-page" ref={pageRef}>
      <div ref={bgRef} className="auth-bg" style={{ backgroundImage: `url(${mercuryBg})` }} aria-hidden="true" />
      <div className="auth-bg-overlay" aria-hidden="true" />
      <div className="auth-center">
        <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-word">COREZ</span>
          <span className="auth-logo-sub">
            {mode === 'login' ? 'Sign in to your account' : 'Closed Beta Registration'}
          </span>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication modes">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@corez.pro"
              required
              autoComplete="email"
              autoFocus
            />
          </label>

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

          {mode === 'signup' && (
            <label>
              <span>Invite Code</span>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="COREZ-INVITE-2026"
                required
                autoComplete="off"
                spellCheck="false"
              />
              <small className="auth-hint">CoreZ is currently invite-only. Enter an active beta code.</small>
            </label>
          )}

          {error && (
            <div className="auth-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <p className="auth-foot">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="auth-link"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Sign up' : 'Login'}
          </button>
        </p>
        </div>
      </div>
    </div>
  );
}
