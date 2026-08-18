/**
 * Email Verification Service
 * Handles 6-digit OTP code dispatch, expiration, attempt rate-limiting,
 * branded HTML email generation from verification@corez.pro, and verification validation.
 */

export const VERIFICATION_SENDER = 'CoreZ Security <verification@corez.pro>';
export const VERIFICATION_STORAGE_KEY = 'corez_email_verification_session';
export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const MAX_VERIFY_ATTEMPTS = 5;

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

/**
 * Validates basic email address formatting.
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Generates a random 6-digit numeric OTP code.
 */
export function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Renders a responsive, branded HTML email template for verification@corez.pro.
 */
export function generateVerificationEmailHtml({ code, email, expiresMinutes = 10 }) {
  const safeEmail = String(email || '').replace(/[<>&"]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CoreZ Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #090a0f; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 480px; background-color: #12131a; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 32px; text-align: left;">
          <tr>
            <td>
              <div style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; margin-bottom: 24px;">
                COREZ
              </div>
              <h1 style="font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 12px;">
                Verify your email address
              </h1>
              <p style="font-size: 14px; line-height: 1.5; color: #9ca3af; margin: 0 0 24px;">
                We received a request to verify your email address (<strong style="color: #ffffff;">${safeEmail}</strong>) for your CoreZ account. Use the 6-digit code below to confirm:
              </p>

              <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #60a5fa; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
                  ${code}
                </span>
              </div>

              <p style="font-size: 13px; line-height: 1.5; color: #9ca3af; margin: 0 0 24px;">
                This code expires in <strong>${expiresMinutes} minutes</strong>. If you did not make this request, you can safely disregard this email.
              </p>

              <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 24px 0;" />

              <p style="font-size: 11px; color: #6b7280; margin: 0; line-height: 1.4;">
                Sent automatically by <strong>${VERIFICATION_SENDER}</strong>.<br />
                CoreZ • AI-Native Creative Development Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Initiates an email verification request for the given email address.
 */
export async function requestEmailVerification(email) {
  if (!isValidEmail(email)) {
    throw new Error('Please enter a valid email address.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const storage = getStorage();

  // Check cooldown if an active session exists
  if (storage) {
    try {
      const existingRaw = storage.getItem(VERIFICATION_STORAGE_KEY);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (existing && existing.email === cleanEmail && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
          const remainingSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
          throw new Error(`Please wait ${remainingSec}s before requesting another verification code.`);
        }
      }
    } catch (err) {
      if (err.message && err.message.includes('Please wait')) throw err;
    }
  }

  // Attempt backend dispatch via /api/verify/send-code if available
  let serverDispatched = false;
  let simulated = true;
  let code = generateOtpCode();

  if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch('/api/verify/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      if (res.ok) {
        const data = await res.json();
        serverDispatched = true;
        simulated = data.simulated !== false;
        if (data.code) code = data.code;
      }
    } catch {
      // Backend not running or offline; proceed to local zero-config fallback
    }
  }

  // Create verification session
  const now = Date.now();
  const session = {
    email: cleanEmail,
    code,
    attempts: 0,
    createdAt: now,
    lastSentAt: now,
    expiresAt: now + OTP_EXPIRY_MS,
    simulated
  };

  if (storage) {
    storage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(session));
  }

  return {
    success: true,
    email: cleanEmail,
    simulated,
    previewCode: simulated ? code : null,
    expiresAt: session.expiresAt,
    sender: VERIFICATION_SENDER,
    message: `Verification code sent to ${cleanEmail} from ${VERIFICATION_SENDER}`
  };
}

/**
 * Validates the entered OTP code against the active verification session.
 */
export async function confirmEmailVerification(email, inputCode) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(inputCode || '').trim();

  if (!cleanCode || cleanCode.length !== 6) {
    throw new Error('Please enter a 6-digit verification code.');
  }

  const storage = getStorage();
  if (!storage) {
    throw new Error('No active verification session found. Please request a new code.');
  }

  let session = null;
  try {
    const raw = storage.getItem(VERIFICATION_STORAGE_KEY);
    if (raw) session = JSON.parse(raw);
  } catch {
    session = null;
  }

  if (!session || session.email !== cleanEmail) {
    throw new Error('No pending verification code found for this email. Please request a new code.');
  }

  if (Date.now() > session.expiresAt) {
    storage.removeItem(VERIFICATION_STORAGE_KEY);
    throw new Error('Verification code has expired. Please request a new code.');
  }

  if (session.attempts >= MAX_VERIFY_ATTEMPTS) {
    storage.removeItem(VERIFICATION_STORAGE_KEY);
    throw new Error('Too many incorrect attempts. Please request a new verification code.');
  }

  // Try backend verification if available
  if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch('/api/verify/check-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.verified) {
          storage.removeItem(VERIFICATION_STORAGE_KEY);
          return { success: true, verified: true, email: cleanEmail };
        }
      }
    } catch {
      // Backend not running; validate via local session
    }
  }

  // Validate local code
  if (session.code !== cleanCode) {
    session.attempts += 1;
    storage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(session));
    const remaining = MAX_VERIFY_ATTEMPTS - session.attempts;
    throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  // Code is valid
  storage.removeItem(VERIFICATION_STORAGE_KEY);
  return {
    success: true,
    verified: true,
    email: cleanEmail,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Retrieves the current verification session if active and unexpired.
 */
export function getActiveVerificationSession(email) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(VERIFICATION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || (email && session.email !== email.trim().toLowerCase())) return null;
    if (Date.now() > session.expiresAt) {
      storage.removeItem(VERIFICATION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Clears any pending verification session.
 */
export function clearVerificationSession() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(VERIFICATION_STORAGE_KEY);
  }
}
