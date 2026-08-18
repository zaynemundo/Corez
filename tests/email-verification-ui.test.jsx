// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import AccountModal from '../src/components/AccountModal.jsx';
import { DEFAULT_ACCOUNT_PROFILE } from '../src/services/accountService.js';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

describe('AccountModal Email Verification Flow', () => {
  it('shows unverified badge when email is provided and executes OTP verification flow', async () => {
    const handleProfileUpdate = vi.fn();
    render(
      <AccountModal
        isOpen={true}
        onClose={() => {}}
        profile={{ ...DEFAULT_ACCOUNT_PROFILE, email: 'dev@corez.pro', emailVerified: false }}
        onProfileUpdate={handleProfileUpdate}
        sessions={[]}
      />
    );

    // Initial state: Unverified badge and Verify Email button
    expect(screen.getByText('Unverified')).toBeDefined();
    const verifyBtn = screen.getByRole('button', { name: /Verify Email/i });
    expect(verifyBtn).toBeDefined();

    // Click Verify Email
    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    // Verification box appears
    expect(screen.getByText('Enter 6-Digit Verification Code')).toBeDefined();
    expect(screen.getByText(/verification@corez.pro/i)).toBeDefined();

    // Dev preview mode displays autofill button
    const autofillPill = screen.getByText(/Zero-Config Dev Mode/i);
    expect(autofillPill).toBeDefined();

    // Click autofill to enter code
    act(() => {
      fireEvent.click(autofillPill);
    });

    // Submit code
    const confirmBtn = screen.getByRole('button', { name: /Confirm Code/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    // Profile update callback triggered with verified status
    expect(handleProfileUpdate).toHaveBeenCalled();
    const updated = handleProfileUpdate.mock.calls[0][0];
    expect(updated.emailVerified).toBe(true);
    expect(updated.verifiedEmail).toBe('dev@corez.pro');
  });
});
