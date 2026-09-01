import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function PaymentSuccess() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying | success | expired | error
  const [detail, setDetail] = useState('');
  const plan = search.get('plan') || 'standard';

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      try {
        const paymentId = search.get('payment_id') || search.get('id') || search.get('paymentId');
        let body = {};
        if (paymentId) body.payment_id = paymentId;
        if (plan) body.plan = plan;

        const res = await fetch('/api/subscriptions/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok && data.verified) {
            setStatus('success');
            const aed = data.aed || (plan === 'premium' ? '27.54' : '18.36');
            const end = data.period_end ? new Date(data.period_end).toLocaleDateString() : '30 days from now';
            setDetail(`Verified — ${data.plan || plan} active. ${aed} AED / month. Renews on ${end}.`);
          } else if (data.verified === false) {
            setStatus('verifying');
            setDetail(data.message || `Payment status: ${data.status}. Please complete payment on Ziina and try again.`);
            // Poll once more after 2s
            setTimeout(() => {
              if (!cancelled) window.location.reload();
            }, 3000);
          } else {
            setStatus('error');
            setDetail(data.error || 'Verification failed. Please contact support.');
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setDetail(e.message || 'Verification failed');
        }
      }
    };
    verify();
    return () => { cancelled = true; };
  }, [search, plan]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '24px' }}>
      <div style={{ maxWidth: '520px', width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Corez — Payment</div>
        <h1 style={{ margin: '12px 0 8px', fontSize: '24px', fontWeight: 800 }}>{status === 'verifying' ? 'Verifying payment…' : status === 'success' ? 'Payment successful ✓' : 'Payment issue'}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>{detail || 'Checking your subscription…'}</p>
        {status === 'verifying' && <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}><span className="thinking-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'pulse 1.2s infinite' }} /><span className="thinking-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'pulse 1.2s 0.2s infinite' }} /><span className="thinking-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'pulse 1.2s 0.4s infinite' }} /></div>}
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => navigate('/')} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 700, cursor: 'pointer' }}>Go to Corez</button>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
        </div>
        <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)' }}>Standard 18.36 AED / month • Premium 27.54 AED / month • Billed monthly via Ziina • Cancel anytime</p>
      </div>
    </div>
  );
}

export function PaymentCancel() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const plan = search.get('plan') || '';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '24px' }}>
      <div style={{ maxWidth: '520px', width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Corez — Payment</div>
        <h1 style={{ margin: '12px 0 8px', fontSize: '24px', fontWeight: 800 }}>Payment canceled</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
          {plan ? `Your ${plan} checkout was canceled. You can stay on Free or try again.` : 'Checkout was canceled. You can stay on Free or try again.'}
        </p>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => navigate('/')} style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 700, cursor: 'pointer' }}>Back to Corez</button>
          <button onClick={() => navigate('/')} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    </div>
  );
}
