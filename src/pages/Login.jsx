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
  const waterRef = useRef(null);

  useEffect(() => {
    const page = pageRef.current;
    const canvas = waterRef.current;
    if (!page || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const ripples = [];
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = page.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const addRipple = (x, y, big = false) => {
      ripples.push({
        x,
        y,
        r: 0,
        maxR: big ? 140 + Math.random() * 40 : 68 + Math.random() * 42,
        speed: big ? 1.7 : 1.35 + Math.random() * 0.6,
        opacity: 0.42,
        line: big ? 1.4 : 1.1,
      });
      // second inner ripple for water depth
      ripples.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        r: 0,
        maxR: big ? 86 : 38,
        speed: big ? 1.1 : 0.95,
        opacity: 0.22,
        line: 0.9,
      });
      if (!raf) raf = requestAnimationFrame(draw);
    };

    // auto gentle ripples like water surface
    const autoTimer = setInterval(() => {
      if (ripples.length > 12) return;
      addRipple(Math.random() * w, Math.random() * h * 0.9 + h * 0.05, Math.random() > 0.7);
    }, 1400);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i];
        p.r += p.speed;
        p.opacity = Math.max(0, 0.42 * (1 - p.r / p.maxR));
        if (p.r >= p.maxR || p.opacity <= 0.01) {
          ripples.splice(i, 1);
          continue;
        }
        alive = true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.lineWidth = p.line;
        ctx.stroke();
        // soft inner glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180,210,255,${p.opacity * 0.18})`;
        ctx.lineWidth = p.line * 0.7;
        ctx.stroke();
      }
      if (alive || ripples.length) {
        raf = requestAnimationFrame(draw);
      } else {
        raf = 0;
      }
    };

    let lastX = 0;
    let lastY = 0;
    const onMove = (e) => {
      const rect = page.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dist = Math.hypot(x - lastX, y - lastY);
      if (dist < 14) return;
      lastX = x;
      lastY = y;
      addRipple(x, y);
      // extra splash on fast move
      if (dist > 38) addRipple(x, y, true);
    };

    const onClick = (e) => {
      const rect = page.getBoundingClientRect();
      addRipple(e.clientX - rect.left, e.clientY - rect.top, true);
      addRipple(e.clientX - rect.left, e.clientY - rect.top, true);
    };

    page.addEventListener('mousemove', onMove);
    page.addEventListener('click', onClick);
    // initial drop
    setTimeout(() => addRipple(w * 0.5, h * 0.5, true), 400);

    return () => {
      window.removeEventListener('resize', resize);
      page.removeEventListener('mousemove', onMove);
      page.removeEventListener('click', onClick);
      clearInterval(autoTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="auth-page" ref={pageRef}>
      <div className="auth-bg" style={{ backgroundImage: `url(${mercuryBg})` }} aria-hidden="true" />
      <canvas ref={waterRef} className="auth-water" aria-hidden="true" />
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
