import React, { useState } from 'react';
import {
  X,
  User,
  Settings,
  Zap,
  Shield,
  Check,
  Download,
  Trash2,
  Palette,
  Sparkles,
  ExternalLink,
  Mail,
  CheckCircle,
  AlertCircle,
  Clock,
  KeyRound,
  RotateCw,
  Send
} from 'lucide-react';
import {
  saveAccountProfile,
  computeAccountStats,
  exportFullUserData,
  resetAccountProfile,
  DEFAULT_AVATAR_COLORS
} from '../services/accountService.js';
import {
  requestEmailVerification,
  confirmEmailVerification,
  getActiveVerificationSession,
  VERIFICATION_SENDER
} from '../services/emailVerificationService.js';
import { DESIGN_ARCHETYPES } from '../../packages/agent-core/designSystems/archetypes.js';

export default function AccountModal({
  isOpen,
  onClose,
  profile,
  onProfileUpdate,
  sessions = []
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'preferences' | 'usage' | 'data'
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || 'Creator',
    handle: profile?.handle || '@creator',
    bio: profile?.bio || '',
    email: profile?.email || '',
    avatarColor: profile?.avatarColor || '#3b82f6',
    avatarUrl: profile?.avatarUrl || '',
    defaultArchetype: profile?.preferences?.defaultArchetype || 'linear-dark',
    defaultViewport: profile?.preferences?.defaultViewport || 'desktop',
    autoRunPreview: profile?.preferences?.autoRunPreview !== false
  });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Email verification states
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isConfirmingCode, setIsConfirmingCode] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [verifySuccess, setVerifySuccess] = useState(null);
  const [previewOtpCode, setPreviewOtpCode] = useState(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  const isEmailVerified = Boolean(
    profile?.emailVerified &&
    profile?.verifiedEmail &&
    profile.verifiedEmail === formData.email.trim().toLowerCase()
  );

  const handleSendVerificationCode = async () => {
    setVerifyError(null);
    setVerifySuccess(null);
    setIsSendingCode(true);
    try {
      const res = await requestEmailVerification(formData.email);
      setIsVerifyingEmail(true);
      if (res.simulated && res.previewCode) {
        setPreviewOtpCode(res.previewCode);
      }
      setVerifySuccess(res.message || 'Verification code sent from verification@corez.pro');
      setCooldownSec(60);
      const interval = setInterval(() => {
        setCooldownSec((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setVerifyError(err.message || 'Failed to send verification code.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerificationCode = async (e) => {
    if (e) e.preventDefault();
    setVerifyError(null);
    setIsConfirmingCode(true);
    try {
      const res = await confirmEmailVerification(formData.email, otpInput);
      if (res.verified) {
        const updated = saveAccountProfile({
          email: formData.email.trim().toLowerCase(),
          emailVerified: true,
          emailVerifiedAt: res.verifiedAt || new Date().toISOString(),
          verifiedEmail: formData.email.trim().toLowerCase()
        });
        if (onProfileUpdate) onProfileUpdate(updated);
        setIsVerifyingEmail(false);
        setOtpInput('');
        setPreviewOtpCode(null);
        setVerifySuccess('Email verified successfully!');
        setTimeout(() => setVerifySuccess(null), 3000);
      }
    } catch (err) {
      setVerifyError(err.message || 'Failed to confirm verification code.');
    } finally {
      setIsConfirmingCode(false);
    }
  };

  if (!isOpen) return null;

  const stats = computeAccountStats(sessions);
  const initials = (formData.displayName || 'C')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'C';

  const handleSave = (e) => {
    if (e) e.preventDefault();
    const updated = saveAccountProfile({
      displayName: formData.displayName.trim() || 'Creator',
      handle: formData.handle.startsWith('@') ? formData.handle.trim() : `@${formData.handle.trim()}`,
      bio: formData.bio.trim(),
      email: formData.email.trim(),
      avatarColor: formData.avatarColor,
      avatarUrl: formData.avatarUrl.trim(),
      preferences: {
        defaultArchetype: formData.defaultArchetype,
        defaultViewport: formData.defaultViewport,
        autoRunPreview: formData.autoRunPreview
      }
    });
    if (onProfileUpdate) onProfileUpdate(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleDownloadBackup = () => {
    const data = exportFullUserData(sessions);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corez-account-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 2500);
  };

  const handleResetProfile = () => {
    if (window.confirm('Are you sure you want to reset your local profile and preferences? Your chat sessions will remain intact.')) {
      const fresh = resetAccountProfile();
      setFormData({
        displayName: fresh.displayName,
        handle: fresh.handle,
        bio: fresh.bio,
        email: fresh.email,
        avatarColor: fresh.avatarColor,
        avatarUrl: fresh.avatarUrl,
        defaultArchetype: fresh.preferences.defaultArchetype,
        defaultViewport: fresh.preferences.defaultViewport,
        autoRunPreview: fresh.preferences.autoRunPreview
      });
      if (onProfileUpdate) onProfileUpdate(fresh);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Account & Profile Settings">
      <div
        className="modal-card account-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '94vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: formData.avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}
            >
              {initials}
            </div>
            <div>
              <span className="modal-title" style={{ fontSize: '1rem', fontWeight: 600 }}>
                {formData.displayName}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                {formData.handle} • {profile?.tier || 'Pro Creator'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className="account-modal-tabs"
          style={{
            display: 'flex',
            gap: '6px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '8px',
            marginBottom: '16px',
            overflowX: 'auto'
          }}
        >
          <button
            type="button"
            className={`account-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: activeTab === 'profile' ? '1px solid var(--accent, #3b82f6)' : '1px solid transparent',
              background: activeTab === 'profile' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'profile' ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #9ca3af)',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'profile' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            <User size={14} />
            <span>Profile</span>
          </button>

          <button
            type="button"
            className={`account-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => setActiveTab('preferences')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: activeTab === 'preferences' ? '1px solid var(--accent, #3b82f6)' : '1px solid transparent',
              background: activeTab === 'preferences' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'preferences' ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #9ca3af)',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'preferences' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            <Palette size={14} />
            <span>Preferences</span>
          </button>

          <button
            type="button"
            className={`account-tab-btn ${activeTab === 'usage' ? 'active' : ''}`}
            onClick={() => setActiveTab('usage')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: activeTab === 'usage' ? '1px solid var(--accent, #3b82f6)' : '1px solid transparent',
              background: activeTab === 'usage' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'usage' ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #9ca3af)',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'usage' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            <Zap size={14} />
            <span>Usage & Plan</span>
          </button>

          <button
            type="button"
            className={`account-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: activeTab === 'data' ? '1px solid var(--accent, #3b82f6)' : '1px solid transparent',
              background: activeTab === 'data' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'data' ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #9ca3af)',
              fontSize: '0.78rem',
              fontWeight: activeTab === 'data' ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            <Shield size={14} />
            <span>Data & Privacy</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Avatar Color
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {DEFAULT_AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, avatarColor: c })}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: formData.avatarColor === c ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.2)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title={c}
                      aria-label={`Select avatar color ${c}`}
                    >
                      {formData.avatarColor === c && <Check size={12} style={{ color: '#ffffff' }} />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="account-display-name" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Display Name
                </label>
                <input
                  id="account-display-name"
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Your Name"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              <div>
                <label htmlFor="account-handle" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Handle / Username
                </label>
                <input
                  id="account-handle"
                  type="text"
                  value={formData.handle}
                  onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                  placeholder="@username"
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div>
                <label htmlFor="account-bio" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Bio & Role
                </label>
                <textarea
                  id="account-bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell CoreZ about your creative focus..."
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 10px',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    resize: 'none'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label htmlFor="account-email" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Email Address
                  </label>
                  {formData.email && (
                    <div>
                      {isEmailVerified ? (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: '#4ade80',
                            background: 'rgba(74, 222, 128, 0.12)',
                            border: '1px solid rgba(74, 222, 128, 0.3)',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <CheckCircle size={11} /> Verified
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: '#fbbf24',
                            background: 'rgba(251, 191, 36, 0.12)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <AlertCircle size={11} /> Unverified
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    id="account-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setVerifyError(null);
                      setVerifySuccess(null);
                    }}
                    placeholder="you@example.com"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 10px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />

                  {formData.email && !isEmailVerified && !isVerifyingEmail && (
                    <button
                      type="button"
                      className="code-btn"
                      onClick={handleSendVerificationCode}
                      disabled={isSendingCode}
                      style={{
                        whiteSpace: 'nowrap',
                        padding: '7px 12px',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        borderColor: 'rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      {isSendingCode ? <RotateCw size={13} className="spin-icon" /> : <Mail size={13} />}
                      <span>{isSendingCode ? 'Sending...' : 'Verify Email'}</span>
                    </button>
                  )}
                </div>

                {/* Verification Box / OTP Input Area */}
                {isVerifyingEmail && (
                  <div
                    className="email-verification-panel"
                    style={{
                      marginTop: '8px',
                      padding: '12px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--accent, #3b82f6)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <KeyRound size={13} style={{ color: 'var(--accent, #3b82f6)' }} />
                        Enter 6-Digit Verification Code
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        From: <b style={{ color: 'var(--text-primary)' }}>verification@corez.pro</b>
                      </span>
                    </div>

                    {previewOtpCode && (
                      <div
                        onClick={() => setOtpInput(previewOtpCode)}
                        style={{
                          fontSize: '0.72rem',
                          color: '#60a5fa',
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px dashed rgba(59, 130, 246, 0.3)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        title="Click to autofill code"
                      >
                        <span>Zero-Config Dev Mode: <strong>{previewOtpCode}</strong></span>
                        <span style={{ fontSize: '0.68rem', textDecoration: 'underline' }}>Click to Autofill</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={otpInput}
                        maxLength={6}
                        onChange={(e) => setOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="123456"
                        aria-label="6-digit verification code"
                        style={{
                          width: '130px',
                          padding: '7px 10px',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          letterSpacing: '4px',
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          background: 'rgba(0, 0, 0, 0.25)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm, 6px)',
                          color: 'var(--text-primary)'
                        }}
                      />
                      <button
                        type="button"
                        className="code-btn"
                        onClick={handleConfirmVerificationCode}
                        disabled={isConfirmingCode || otpInput.length !== 6}
                        style={{
                          padding: '7px 14px',
                          fontSize: '0.75rem',
                          background: 'var(--accent, #3b82f6)',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        {isConfirmingCode ? <RotateCw size={13} className="spin-icon" /> : <Check size={13} />}
                        <span>Confirm Code</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={handleSendVerificationCode}
                        disabled={cooldownSec > 0 || isSendingCode}
                        title={cooldownSec > 0 ? `Resend available in ${cooldownSec}s` : 'Resend Code'}
                        style={{ fontSize: '0.72rem', padding: '6px 10px', color: cooldownSec > 0 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                      >
                        <RotateCw size={13} />
                        <span style={{ marginLeft: '4px' }}>{cooldownSec > 0 ? `${cooldownSec}s` : 'Resend'}</span>
                      </button>
                    </div>

                    {verifyError && (
                      <p role="alert" style={{ fontSize: '0.72rem', color: '#f87171', margin: '2px 0 0' }}>
                        {verifyError}
                      </p>
                    )}
                  </div>
                )}

                {verifySuccess && !isVerifyingEmail && (
                  <p role="status" style={{ fontSize: '0.72rem', color: '#4ade80', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={12} /> {verifySuccess}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                {savedSuccess && (
                  <span style={{ fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={13} /> Profile Saved
                  </span>
                )}
                <button
                  type="submit"
                  className="code-btn"
                  style={{ padding: '7px 14px', fontSize: '0.78rem', background: 'var(--accent, #3b82f6)', color: '#ffffff' }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* PREFERENCES TAB */}
          {activeTab === 'preferences' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Default Design System Archetype
                </label>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Newly synthesized web apps and websites will automatically default to this visual aesthetic.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  {Object.values(DESIGN_ARCHETYPES).map((arch) => {
                    const isSelected = formData.defaultArchetype === arch.id;
                    const accent = arch.tokens['--accent'] || '#3b82f6';
                    return (
                      <div
                        key={arch.id}
                        onClick={() => setFormData({ ...formData, defaultArchetype: arch.id })}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm, 6px)',
                          border: isSelected ? `1px solid ${accent}` : '1px solid var(--border-color)',
                          background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: accent }} />
                            {arch.name}
                          </span>
                          {isSelected && <Check size={13} style={{ color: accent }} />}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                          {arch.description}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Default Preview Viewport
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['desktop', 'tablet', 'mobile'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFormData({ ...formData, defaultViewport: mode })}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: formData.defaultViewport === mode ? '1px solid var(--accent, #3b82f6)' : '1px solid var(--border-color)',
                        background: formData.defaultViewport === mode ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-tertiary)',
                        color: formData.defaultViewport === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: formData.defaultViewport === mode ? 600 : 400,
                        textTransform: 'capitalize',
                        cursor: 'pointer'
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                {savedSuccess && (
                  <span style={{ fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={13} /> Preferences Saved
                  </span>
                )}
                <button
                  type="button"
                  className="code-btn"
                  onClick={handleSave}
                  style={{ padding: '7px 14px', fontSize: '0.78rem', background: 'var(--accent, #3b82f6)', color: '#ffffff' }}
                >
                  Save Preferences
                </button>
              </div>
            </div>
          )}

          {/* USAGE & PLAN TAB */}
          {activeTab === 'usage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} style={{ color: 'var(--accent, #818cf8)' }} />
                    {profile?.tier || 'Pro Creator'} Tier Active
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                    Unlimited creation streaming, multi-agent swarm DAG, and 1-time slug publishing enabled.
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Conversations</span>
                  <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>{stats.totalSessions}</p>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Messages Exchanged</span>
                  <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>{stats.totalMessages}</p>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Published Creations</span>
                  <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>{stats.publishedCreations}</p>
                </div>
                <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Storage Used (approx)</span>
                  <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>{stats.storageEstimateKb} KB</p>
                </div>
              </div>
            </div>
          )}

          {/* DATA & PRIVACY TAB */}
          {activeTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Download size={15} />
                  Export Account Data & Chat History
                </span>
                <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Download a complete backup JSON containing your profile settings, preferences, and all conversation sessions.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="code-btn"
                    onClick={handleDownloadBackup}
                    style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Download size={13} />
                    <span>Download Backup (JSON)</span>
                  </button>
                  {exportSuccess && (
                    <span style={{ fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={13} /> Backup Exported
                    </span>
                  )}
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Trash2 size={15} />
                  Reset Local Profile & Preferences
                </span>
                <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Resets your account details and preferences back to fresh defaults without deleting your saved conversation sessions.
                </p>
                <button
                  type="button"
                  className="code-btn"
                  onClick={handleResetProfile}
                  style={{ fontSize: '0.78rem', padding: '6px 12px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                >
                  Reset Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
