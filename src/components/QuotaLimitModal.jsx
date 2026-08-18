import React from 'react';
import { X, Sparkles, Zap, Shield, Globe, ArrowRight, UserPlus, LogIn } from 'lucide-react';

export default function QuotaLimitModal({
  isOpen,
  onClose,
  onOpenSignUp,
  onOpenSignIn,
  action = 'message' // 'message' | 'publish' | 'image'
}) {
  if (!isOpen) return null;

  const isPublishAction = action === 'publish';

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Guest Usage Limit Reached">
      <div
        className="modal-card quota-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '460px',
          maxWidth: '92vw',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          textAlign: 'left'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f87171'
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isPublishAction ? 'Publishing Limit Reached' : 'Daily Guest Limit Reached'}
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {isPublishAction
                  ? 'Guests can publish 1 free creation per day.'
                  : 'You have used all 5 free guest prompts for today.'}
              </span>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Value Proposition List */}
        <div
          style={{
            background: 'var(--bg-tertiary, #181922)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Sign up for a free CoreZ account to unlock:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Zap size={14} style={{ color: 'var(--accent, #60a5fa)', flexShrink: 0 }} />
            <span><b>Unlimited AI prompts</b> & fast code streaming</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Globe size={14} style={{ color: '#34d399', flexShrink: 0 }} />
            <span><b>Instant web publishing</b> & custom live URL links</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <Shield size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <span><b>Session sync & storage</b> with multi-agent DAGs</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            className="code-btn"
            onClick={() => {
              onClose();
              if (onOpenSignUp) onOpenSignUp();
            }}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: 'var(--accent, #3b82f6)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <UserPlus size={15} />
            <span>Create Free Account (Unlimited Access)</span>
          </button>

          <button
            type="button"
            className="code-btn"
            onClick={() => {
              onClose();
              if (onOpenSignIn) onOpenSignIn();
            }}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <LogIn size={14} />
            <span>Already have an account? Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );
}
