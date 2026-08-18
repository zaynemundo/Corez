import React, { useState, useEffect } from 'react';
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
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { signUp, logIn, logInWithVerifiedEmail } from '../services/authService.js';
import { requestEmailVerification, confirmEmailVerification } from '../services/emailVerificationService.js';

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  initialMode = 'signin' // 'signin' | 'signup'
}) {
  const [mode, setMode] = useState(initialMode); // 'signin' | 'signup' | 'otp' | 'otp_signup'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [previewCode, setPreviewCode] = useState(null);
  const [pendingSignUp, setPendingSignUp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSuccess(null);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

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

  const handleStartSignUp = async (e) => {
    e.preventDefault();
    if (!displayName || !displayName.trim()) {
      setError('Please enter your display name.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Send 6-digit verification code from verification@corez.pro
      const res = await requestEmailVerification(email.trim());
      if (res.simulated && res.previewCode) {
        setPreviewCode(res.previewCode);
      }
      setPendingSignUp({ displayName: displayName.trim(), email: email.trim(), password });
      setOtpCode('');
      setResendCooldown(60);
      setMode('otp_signup');
      setSuccess(`Verification code sent to ${email} from verification@corez.pro`);
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSignUpOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const targetEmail = pendingSignUp?.email || email;
      await confirmEmailVerification(targetEmail, otpCode.trim());
      const session = await signUp({
        displayName: pendingSignUp?.displayName || displayName,
        email: targetEmail,
        password: pendingSignUp?.password || password,
        emailVerified: true
      });
      setSuccess(`Account verified and created! Welcome to CoreZ, ${session.user.displayName}.`);
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

  const handleRequestMagicOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address to receive a login code.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await requestEmailVerification(email);
      if (res.simulated && res.previewCode) {
        setPreviewCode(res.previewCode);
      }
      setMode('otp');
      setResendCooldown(60);
      setSuccess(`Verification code sent to ${email} from verification@corez.pro`);
    } catch (err) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMagicOtp = async (e) => {
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

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    const targetEmail = pendingSignUp?.email || email;
    if (!targetEmail) return;
    setError(null);
    setLoading(true);
    try {
      const res = await requestEmailVerification(targetEmail);
      if (res.simulated && res.previewCode) {
        setPreviewCode(res.previewCode);
      }
      setResendCooldown(60);
      setSuccess(`New verification code sent to ${targetEmail}`);
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const isOtpMode = mode === 'otp' || mode === 'otp_signup';

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
            <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
              COREZ
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>• Authentication</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        {!isOtpMode && (
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
                  onClick={handleRequestMagicOtp}
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '10px', top: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
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

        {/* SIGN UP FORM (Triggering OTP Verification) */}
        {mode === 'signup' && (
          <form onSubmit={handleStartSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label htmlFor="auth-signup-name" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Display Name
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-signup-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Zayne Mundo"
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
              <label htmlFor="auth-signup-password" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Password (min 6 characters)
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '10px', top: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={13} style={{ color: '#34d399', flexShrink: 0 }} />
              <span>We'll send a 6-digit verification code from <b>verification@corez.pro</b>.</span>
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
              {loading ? <RotateCw size={14} className="spin-icon" /> : <Sparkles size={14} />}
              <span>{loading ? 'Sending Code...' : 'Continue & Verify Email'}</span>
            </button>
          </form>
        )}

        {/* SIGNUP OTP VERIFICATION FLOW */}
        {mode === 'otp_signup' && (
          <form onSubmit={handleConfirmSignUpOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} style={{ color: '#34d399' }} />
                Verify Your Account Email
              </span>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Enter the 6-digit code sent from <b>verification@corez.pro</b> to <b>{pendingSignUp?.email || email}</b>:
              </p>
            </div>

            {previewCode && (
              <div
                onClick={() => setOtpCode(previewCode)}
                style={{
                  fontSize: '0.74rem',
                  color: '#60a5fa',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>Zero-Config Code: <strong style={{ letterSpacing: '1px' }}>{previewCode}</strong></span>
                  <span style={{ textDecoration: 'underline', fontSize: '0.7rem', fontWeight: 600 }}>Click to Autofill</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  Local Dev Mode: No live mail server connected yet. Click here to autofill and verify instantly!
                </span>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: resendCooldown > 0 ? 'var(--text-secondary)' : 'var(--accent, #60a5fa)',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  padding: 0,
                  fontSize: '0.72rem'
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="code-btn"
                onClick={() => setMode('signup')}
                style={{ flex: 1, padding: '8px' }}
              >
                Back to Edit
              </button>
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="code-btn"
                style={{ flex: 2, padding: '8px', background: 'var(--accent, #3b82f6)', color: '#ffffff' }}
              >
                {loading ? 'Verifying...' : 'Verify & Create Account'}
              </button>
            </div>
          </form>
        )}

        {/* MAGIC OTP CODE LOGIN (For existing accounts) */}
        {mode === 'otp' && (
          <form onSubmit={handleConfirmMagicOtp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                  fontSize: '0.74rem',
                  color: '#60a5fa',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>Zero-Config Code: <strong style={{ letterSpacing: '1px' }}>{previewCode}</strong></span>
                  <span style={{ textDecoration: 'underline', fontSize: '0.7rem', fontWeight: 600 }}>Click to Autofill</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  Local Dev Mode: No live mail server connected yet. Click here to autofill and verify instantly!
                </span>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: resendCooldown > 0 ? 'var(--text-secondary)' : 'var(--accent, #60a5fa)',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  padding: 0,
                  fontSize: '0.72rem'
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
              </button>
            </div>

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
