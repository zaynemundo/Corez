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

    const img = new Image();
    img.src = mercuryBg;
    let imgLoaded = false;
    img.onload = () => { imgLoaded = true; if (!raf) raf = requestAnimationFrame(draw); };

    let raf = 0;
    const ripples = [];
    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let time = 0;

    // grid for water flow that actually distorts the Mercury image
    const cols = 56;
    const rows = 32;

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
        x, y,
        r: 0,
        maxR: big ? 220 : 88 + Math.random() * 36,
        speed: big ? 2.1 : 1.6 + Math.random() * 0.7,
        strength: big ? 18 : 10,
        opacity: 0.5,
      });
      if (!raf) raf = requestAnimationFrame(draw);
    };

    // gentle auto flow
    const autoTimer = setInterval(() => {
      if (ripples.length > 10) return;
      addRipple(Math.random() * w, Math.random() * h, Math.random() > 0.75);
    }, 900);

    const draw = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      if (imgLoaded && img.complete && img.naturalWidth) {
        // draw Mercury image with water flow: grid displacement driven by ripples + gentle wave
        const cellW = w / cols;
        const cellH = h / rows;
        // cover-fit the Mercury image into canvas
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const scale = Math.max(w / iw, h / ih);
        const sw = iw * scale;
        const sh = ih * scale;
        const sx0 = (w - sw) / 2;
        const sy0 = (h - sh) / 2;

        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            const x = gx * cellW;
            const y = gy * cellH;
            const cx = x + cellW / 2;
            const cy = y + cellH / 2;

            // base gentle water flow (sine wave)
            let dx = Math.sin(cy * 0.008 + time * 0.7) * 2.2 + Math.cos(cx * 0.006 + time * 0.5) * 1.6;
            let dy = Math.cos(cx * 0.007 + time * 0.6) * 1.4 + Math.sin(cy * 0.005 + time * 0.4) * 1.2;

            // ripple displacement - flow interacts with image
            for (const p of ripples) {
              const dist = Math.hypot(cx - p.x, cy - p.y);
              if (dist < p.r && dist > p.r - 26) {
                const wave = Math.sin((dist - p.r) * 0.22) * p.strength * (1 - p.r / p.maxR);
                const ang = Math.atan2(cy - p.y, cx - p.x);
                dx += Math.cos(ang) * wave * 0.45;
                dy += Math.sin(ang) * wave * 0.45;
              } else if (dist < p.r) {
                const inside = (1 - dist / p.r) * 0.6;
                dx += Math.sin(dist * 0.08 + time * 2) * inside;
                dy += Math.cos(dist * 0.08 + time * 2) * inside;
              }
            }

            // sample from Mercury image with displacement
            const sx = ((x + dx - sx0) / sw) * iw;
            const sy = ((y + dy - sy0) / sh) * ih;
            const sW = (cellW / sw) * iw;
            const sH = (cellH / sh) * ih;

            if (sx >= 0 && sy >= 0 && sx + sW <= iw && sy + sH <= ih) {
              ctx.drawImage(img, sx, sy, sW, sH, x, y, cellW + 0.7, cellH + 0.7);
            } else {
              // edge clamp
              ctx.drawImage(img, Math.max(0, sx), Math.max(0, sy), Math.min(sW, iw), Math.min(sH, ih), x, y, cellW + 0.7, cellH + 0.7);
            }
          }
        }
      } else {
        // fallback while image loads
        ctx.fillStyle = '#08080a';
        ctx.fillRect(0, 0, w, h);
      }

      // draw the flow ripples themselves (water lines) on top of the distorted image
      let alive = false;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i];
        p.r += p.speed;
        p.opacity = Math.max(0, 0.5 * (1 - p.r / p.maxR));
        if (p.r >= p.maxR) { ripples.splice(i, 1); continue; }
        alive = true;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${p.opacity * 0.55})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.68, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(160,200,255,${p.opacity * 0.16})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // keep flowing even without ripples for the gentle wave
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    let lastX = 0;
    let lastY = 0;
    const onMove = (e) => {
      const rect = page.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (Math.hypot(x - lastX, y - lastY) < 12) return;
      lastX = x; lastY = y;
      addRipple(x, y);
      if (Math.hypot(x - lastX, y - lastY) > 32) addRipple(x, y, true);
    };
    const onClick = (e) => {
      const rect = page.getBoundingClientRect();
      addRipple(e.clientX - rect.left, e.clientY - rect.top, true);
    };

    page.addEventListener('mousemove', onMove);
    page.addEventListener('click', onClick);
    setTimeout(() => addRipple(w * 0.52, h * 0.48, true), 500);

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
