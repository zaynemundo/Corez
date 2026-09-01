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

        <div className="settings-section">
          <div className="settings-section-label">Plan &amp; Billing</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {currentPlan === 'premium' ? <Crown size={14} /> : currentPlan === 'standard' ? <Zap size={14} /> : <Sparkles size={14} />}
                  {currentPlan} {isExpired ? '(expired)' : ''}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {subLoading ? 'Loading…' : currentPlan === 'free' ? 'Free forever' : periodEnd ? (isExpired ? `Expired on ${periodEnd} — renew to continue` : `Renews on ${periodEnd} • Monthly via Ziina`) : 'Monthly via Ziina • Cancel anytime'}
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '999px', background: isExpired ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)', color: isExpired ? '#fca5a5' : '#86efac', border: '1px solid', borderColor: isExpired ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)' }}>
                {isExpired ? 'Expired' : sub?.status === 'active' ? 'Active' : currentPlan === 'free' ? 'Active' : sub?.status || 'Active'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { id: 'free', name: 'Free', price: '0 AED', sub: 'forever', features: 'Limited' },
                { id: 'standard', name: 'Standard', price: '18.36 AED', sub: '/mo', features: 'More builds', popular: true },
                { id: 'premium', name: 'Premium', price: '27.54 AED', sub: '/mo', features: 'Unlimited' },
              ].map(p => {
                const isCurrent = currentPlan === p.id && !isExpired;
                const busy = payBusy === p.id;
                return (
                  <div key={p.id} style={{ padding: '10px 8px', borderRadius: '10px', border: isCurrent ? '1.5px solid var(--text-primary)' : '1px solid var(--border-color)', background: isCurrent ? 'var(--bg-tertiary)' : 'transparent', textAlign: 'center', position: 'relative', opacity: busy ? 0.7 : 1 }}>
                    {p.popular && !isCurrent && <span style={{ position: 'absolute', top: '-7px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--text-primary)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '999px' }}>Popular</span>}
                    {isCurrent && <span style={{ position: 'absolute', top: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={10} strokeWidth={2.5} /></span>}
                    <div style={{ fontWeight: 700, fontSize: '12px' }}>{p.name}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '4px' }}>{p.price}<span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text-muted)' }}> {p.sub}</span></div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{p.features}</div>
                    <button
                      type="button"
                      disabled={busy || isCurrent}
                      onClick={() => handleCheckout(p.id)}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '6px',
                        borderRadius: '7px',
                        border: isCurrent ? '1px solid var(--border-color)' : '1px solid var(--text-primary)',
                        background: isCurrent ? 'transparent' : 'var(--text-primary)',
                        color: isCurrent ? 'var(--text-muted)' : 'var(--bg-primary)',
                        fontWeight: 600,
                        fontSize: '11px',
                        cursor: isCurrent || busy ? 'default' : 'pointer',
                        opacity: isCurrent ? 0.6 : 1
                      }}
                    >
                      {busy ? '...' : isCurrent ? 'Current' : p.id === 'free' ? 'Downgrade' : 'Upgrade'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
              Billed monthly via Ziina • Cancel anytime • <span style={{ color: 'var(--text-secondary)' }}>Standard 18.36 AED / mo • Premium 27.54 AED / mo</span>
            </div>
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
