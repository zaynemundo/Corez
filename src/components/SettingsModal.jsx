import { useState, useEffect } from 'react';
import { X, Settings, Trash2, Sun, Moon, LogOut, User, Crown, Zap, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SettingsModal({ isOpen, onClose, onClearAllHistory, theme, onToggleTheme }) {
  if (!isOpen) return null;
  let auth;
  try { auth = useAuth(); } catch { auth = null; }
  const email = auth?.user?.email || '';
  const userPlan = auth?.user?.plan || 'free';
  const isDark = theme === 'dark';
  const [sub, setSub] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [payBusy, setPayBusy] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      setSubLoading(true);
      try {
        const r = await fetch('/api/subscriptions/me', { credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setSub(d);
      } catch {}
      if (!cancelled) setSubLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  const currentPlan = sub?.plan || userPlan || 'free';
  const isExpired = sub?.status === 'expired' || sub?.isExpired;
  const periodEnd = sub?.period_end ? new Date(sub.period_end).toLocaleDateString() : null;

  const handleCheckout = async (plan) => {
    if (plan === 'free') {
      // Downgrade / cancel
      if (!confirm('Downgrade to Free? You will lose paid features at period end.')) return;
      setPayBusy(plan);
      try {
        const r = await fetch('/api/subscriptions/cancel', { method: 'POST', credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          alert('Downgraded to Free');
          // refresh auth and subscription
          try { await auth?.refresh?.(); } catch {}
          const mr = await fetch('/api/subscriptions/me', { credentials: 'include' });
          const md = await mr.json().catch(() => ({}));
          if (mr.ok) setSub(md);
        } else {
          alert(d.error || 'Failed to cancel');
        }
      } finally { setPayBusy(''); }
      return;
    }
    setPayBusy(plan);
    try {
      const origin = window.location.origin;
      const r = await fetch('/api/subscriptions/checkout', {
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
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.redirect_url) {
        window.location.href = d.redirect_url;
      } else if (d.free) {
        alert('Free plan activated');
        try { await auth?.refresh?.(); } catch {}
      } else {
        alert(d.error || 'Checkout failed');
      }
    } catch (e) {
      alert(e.message || 'Checkout failed');
    } finally {
      setPayBusy('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card settings-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} strokeWidth={1.5} />
            <span className="modal-title">Settings</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Account</div>
          <div className="settings-profile-card">
            <div className="settings-avatar" aria-hidden="true">
              <User size={16} strokeWidth={1.5} />
            </div>
            <div className="settings-profile-meta">
              <span className="settings-profile-email" title={email}>{email || 'Guest'}</span>
              <span className="settings-profile-sub">Signed in to Corez</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Appearance</div>
          <button
            type="button"
            className="settings-row-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="settings-row-left">
              {isDark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </span>
            <span className="settings-row-hint">{isDark ? 'Switch to light' : 'Switch to dark'}</span>
          </button>
        </div>

        <div className="settings-section pricing-section">
          <div className="settings-section-label">Plan &amp; Billing</div>
          <div className={`pricing-status ${isExpired ? 'expired' : currentPlan}`}>
            <div className="pricing-status-left">
              <span className={`pricing-status-icon ${currentPlan}`}>
                {currentPlan === 'premium' ? <Crown size={14} strokeWidth={1.75} /> : currentPlan === 'standard' ? <Zap size={14} strokeWidth={1.75} /> : <Sparkles size={14} strokeWidth={1.75} />}
              </span>
              <div>
                <div className="pricing-status-plan">{currentPlan} {isExpired ? '(expired)' : ''}</div>
                <div className="pricing-status-desc">
                  {subLoading ? 'Loading…' : currentPlan === 'free' ? 'Free forever — upgrade anytime' : periodEnd ? (isExpired ? `Expired on ${periodEnd} — renew to continue` : `Renews on ${periodEnd} • Monthly via Ziina`) : 'Monthly via Ziina • Cancel anytime'}
                </div>
              </div>
            </div>
            <span className={`pricing-status-badge ${isExpired ? 'expired' : 'active'}`}>
              {isExpired ? 'Expired' : sub?.status === 'active' ? 'Active' : currentPlan === 'free' ? 'Active' : sub?.status || 'Active'}
            </span>
          </div>

          <div className="pricing-grid">
            {[
              { id: 'free', name: 'Free', price: '0', currency: 'AED', sub: 'forever', icon: Sparkles, features: ['20 generations / mo', '1 project', 'Community support'], cta: 'Downgrade' },
              { id: 'standard', name: 'Standard', price: '18.36', currency: 'AED', sub: '/ month', icon: Zap, features: ['200 generations / mo', '10 projects', 'Publish & share', 'Priority queue'], popular: true, cta: 'Upgrade' },
              { id: 'premium', name: 'Premium', price: '27.54', currency: 'AED', sub: '/ month', icon: Crown, features: ['Unlimited generations', 'Unlimited projects', 'Priority support', 'Early access'], cta: 'Go Premium' },
            ].map(p => {
              const isCurrent = currentPlan === p.id && !isExpired;
              const busy = payBusy === p.id;
              const Icon = p.icon;
              const tierClass = `pricing-card--${p.id}`;
              return (
                <div key={p.id} className={`pricing-card ${tierClass} ${isCurrent ? 'pricing-card--current' : ''} ${p.popular ? 'pricing-card--popular' : ''} ${busy ? 'pricing-card--busy' : ''}`}>
                  {p.popular && <span className="pricing-popular-badge">Most Popular</span>}
                  {isCurrent && <span className="pricing-current-check"><Check size={11} strokeWidth={2.5} /></span>}
                  <div className="pricing-card-icon">
                    <Icon size={16} strokeWidth={1.75} />
                  </div>
                  <div className="pricing-card-name">{p.name}</div>
                  <div className="pricing-card-price">
                    <span className="pricing-price-amount">{p.price}</span>
                    <span className="pricing-price-currency">{p.currency}</span>
                    <span className="pricing-price-interval">{p.sub}</span>
                  </div>
                  <ul className="pricing-card-features">
                    {p.features.map(f => (
                      <li key={f}><Check size={11} strokeWidth={2} className="pricing-feature-check" />{f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy || isCurrent}
                    onClick={() => handleCheckout(p.id)}
                    className={`pricing-cta ${isCurrent ? 'pricing-cta--current' : p.id === 'premium' ? 'pricing-cta--premium' : p.id === 'standard' ? 'pricing-cta--standard' : 'pricing-cta--free'}`}
                  >
                    {busy ? 'Processing…' : isCurrent ? 'Current plan' : p.cta}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="pricing-footnote">
            Billed monthly via <strong>Ziina</strong> • Cancel anytime • <span>Secure checkout • AED</span>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Support</div>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Corez automatically routes text, code and visual requests through configured hosted AI services with resilient fallbacks. Model selection is managed server-side.
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-danger-btn"
            onClick={onClearAllHistory}
          >
            <Trash2 size={15} strokeWidth={1.5} />
            <span>Clear Conversation History</span>
          </button>
          {auth?.user && (
            <button
              type="button"
              className="settings-row-btn"
              onClick={() => { onClose(); auth.logout(); }}
            >
              <span className="settings-row-left">
                <LogOut size={16} strokeWidth={1.5} />
                <span>Log out</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
