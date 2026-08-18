import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  KeyRound,
  RotateCw,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { signUp, logIn, logInWithVerifiedEmail } from '../services/authService.js';
import { requestEmailVerification, confirmEmailVerification } from '../services/emailVerificationService.js';

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'signin' // 'signin' | 'signup'
}) {
  const [mode, setMode] = useState(initialMode); // 'signin' | 'signup' | 'otp'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [previewCode, setPreviewCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!isOpen) return null;

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await logIn({ email, password });
      setSuccess(`Welcome back, ${session.user.displayName}!`);
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(session.user);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await signUp({ displayName, email, password });
      setSuccess(`Account created! Welcome to CoreZ, ${session.user.displayName}.`);
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(session.user);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await requestEmailVerification(email);
      if (res.simulated && res.previewCode) {
        setPreviewCode(res.previewCode);
      }
      setMode('otp');
      setSuccess(`Verification code sent to ${email} from verification@corez.pro`);
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmEmailVerification(email, otpCode);
      const session = await logInWithVerifiedEmail(email);
      setSuccess(`Email verified! Welcome, ${session.user.displayName}.`);
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(session.user);
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign In or Sign Up">
      <div
        className="modal-card auth-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '420px',
          maxWidth: '92vw',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#ffffff' }}>
              COREZ
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>• Authentication</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        {mode !== 'otp' && (
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-tertiary, #181922)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '3px',
              gap: '4px'
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              aria-label="Switch to Sign In tab"
              onClick={() => {
                setMode('signin');
                setError(null);
                setSuccess(null);
              }}
              style={{
                flex: 1,
                padding: '6px',
                border: 'none',
                borderRadius: '4px',
                background: mode === 'signin' ? 'var(--accent, #3b82f6)' : 'transparent',
                color: mode === 'signin' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              aria-label="Switch to Create Account tab"
              onClick={() => {
                setMode('signup');
                setError(null);
                setSuccess(null);
              }}
              style={{
                flex: 1,
                padding: '6px',
                border: 'none',
                borderRadius: '4px',
                background: mode === 'signup' ? 'var(--accent, #3b82f6)' : 'transparent',
                color: mode === 'signup' ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* SIGN IN FORM */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label htmlFor="auth-signin-email" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px 8px 32px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
                <Mail size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor="auth-signin-password" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent, #60a5fa)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                >
                  Sign in with Code
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 32px 8px 32px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
                <Lock size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '10px', top: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="code-btn"
              style={{
                width: '100%',
                padding: '9px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: 'var(--accent, #3b82f6)',
                color: '#ffffff',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {loading ? <RotateCw size={14} className="spin-icon" /> : <ArrowRight size={14} />}
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
            </button>
          </form>
        )}

        {/* SIGN UP FORM */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label htmlFor="auth-signup-name" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Your Name
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signup-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Rivera"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px 8px 32px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
                <User size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              </div>
            </div>

            <div>
              <label htmlFor="auth-signup-email" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px 8px 32px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
                <Mail size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              </div>
            </div>

            <div>
              <label htmlFor="auth-signup-password" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Password (min 6 chars)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 32px 8px 32px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
                <Lock size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '10px', top: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              aria-label="Submit create account"
              disabled={loading}
              className="code-btn"
              style={{
                width: '100%',
                padding: '9px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: 'var(--accent, #3b82f6)',
                color: '#ffffff',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {loading ? <RotateCw size={14} className="spin-icon" /> : <Sparkles size={14} />}
              <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
            </button>
          </form>
        )}

        {/* OTP CODE LOGIN / VERIFICATION */}
        {mode === 'otp' && (
          <form onSubmit={handleConfirmOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <KeyRound size={14} style={{ color: 'var(--accent, #3b82f6)' }} />
                Verification Code Sent
              </span>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Enter the 6-digit code sent from <b>verification@corez.pro</b> to <b>{email}</b>:
              </p>
            </div>

            {previewCode && (
              <div
                onClick={() => setOtpCode(previewCode)}
                style={{
                  fontSize: '0.72rem',
                  color: '#60a5fa',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px dashed rgba(59, 130, 246, 0.3)',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>Zero-Config Dev Mode: <strong>{previewCode}</strong></span>
                <span style={{ textDecoration: 'underline' }}>Click to Autofill</span>
              </div>
            )}

            <input
              type="text"
              required
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="123456"
              aria-label="6-digit verification code"
              style={{
                width: '100%',
                padding: '9px',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '6px',
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)'
              }}
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="code-btn"
                onClick={() => setMode('signin')}
                style={{ flex: 1, padding: '8px' }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="code-btn"
                style={{ flex: 2, padding: '8px', background: 'var(--accent, #3b82f6)', color: '#ffffff' }}
              >
                {loading ? 'Verifying...' : 'Confirm & Log In'}
              </button>
            </div>
          </form>
        )}

        {/* Feedback messages */}
        {error && (
          <div role="alert" style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" style={{ fontSize: '0.75rem', color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.25)', borderRadius: '6px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={13} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}
      </div>
    </div>
  );
}
