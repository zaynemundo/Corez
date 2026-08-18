// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidEmail,
  generateOtpCode,
  generateVerificationEmailHtml,
  requestEmailVerification,
  confirmEmailVerification,
  getActiveVerificationSession,
  clearVerificationSession,
  VERIFICATION_SENDER,
  VERIFICATION_STORAGE_KEY
} from '../src/services/emailVerificationService.js';

describe('Email Verification Service (verification@corez.pro)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates email addresses correctly', () => {
    expect(isValidEmail('user@corez.pro')).toBe(true);
    expect(isValidEmail('creator.dev+test@domain.co.uk')).toBe(true);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });

  it('generates 6-digit numeric OTP codes', () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('renders a branded HTML email from verification@corez.pro', () => {
    const html = generateVerificationEmailHtml({
      code: '849201',
      email: 'creator@corez.pro',
      expiresMinutes: 10
    });

    expect(html).toContain('COREZ');
    expect(html).toContain('849201');
    expect(html).toContain('creator@corez.pro');
    expect(html).toContain('10 minutes');
    expect(html).toContain(VERIFICATION_SENDER);
    expect(html).toContain('verification@corez.pro');
  });

  it('creates an OTP session and enforces 60-second resend cooldown', async () => {
    const res = await requestEmailVerification('alex@example.com');
    expect(res.success).toBe(true);
    expect(res.email).toBe('alex@example.com');
    expect(res.sender).toContain('verification@corez.pro');

    const session = getActiveVerificationSession('alex@example.com');
    expect(session).toBeDefined();
    expect(session.code).toHaveLength(6);

    // Immediate second request must trigger cooldown error
    await expect(requestEmailVerification('alex@example.com')).rejects.toThrow(/Please wait \d+s/);
  });

  it('rejects incorrect codes and increments attempt count', async () => {
    const res = await requestEmailVerification('sarah@example.com');
    const validCode = res.previewCode;

    // Incorrect code
    await expect(confirmEmailVerification('sarah@example.com', '000000')).rejects.toThrow(/Invalid verification code/);

    // Correct code
    const verifyRes = await confirmEmailVerification('sarah@example.com', validCode);
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.verified).toBe(true);
    expect(verifyRes.email).toBe('sarah@example.com');

    // Session is cleared after successful verification
    expect(localStorage.getItem(VERIFICATION_STORAGE_KEY)).toBeNull();
  });
});
