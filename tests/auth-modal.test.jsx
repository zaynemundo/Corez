// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import AuthModal from '../src/components/AuthModal.jsx';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

describe('AuthModal Component', () => {
  it('renders Sign In tab by default and switches to Create Account tab', async () => {
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={() => {}} />);

    const signInTab = screen.getByRole('tab', { name: /Switch to Sign In tab/i });
    const createTab = screen.getByRole('tab', { name: /Switch to Create Account tab/i });
    expect(signInTab).toBeDefined();
    expect(createTab).toBeDefined();

    // Switch to Create Account
    await act(async () => {
      fireEvent.click(createTab);
    });

    expect(screen.getByLabelText(/Display Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Password \(min 6 characters\)/i)).toBeDefined();
  });

  it('completes the Create Account with email OTP verification flow', async () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={handleAuthSuccess} initialMode="signup" />);

    const nameInput = screen.getByLabelText(/Display Name/i);
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passInput = screen.getByLabelText(/Password \(min 6 characters\)/i);

    fireEvent.change(nameInput, { target: { value: 'Sam Smith' } });
    fireEvent.change(emailInput, { target: { value: 'sam@corez.pro' } });
    fireEvent.change(passInput, { target: { value: 'secretpass123' } });

    const submitBtn = screen.getByRole('button', { name: /Continue & Verify Email/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Verification screen should appear
    await waitFor(() => {
      expect(screen.getByText(/Verify Your Account Email/i)).toBeDefined();
      expect(screen.getByLabelText(/6-digit verification code/i)).toBeDefined();
    });

    // Use Dev Mode autofill helper
    const devAutofill = screen.getByText(/Click to Autofill/i);
    await act(async () => {
      fireEvent.click(devAutofill);
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify & Create Account/i });
    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    // Account verified and created
    await waitFor(() => {
      expect(screen.getByText(/Account verified and created!/i)).toBeDefined();
      expect(handleAuthSuccess).toHaveBeenCalled();
    });
  });

  it('handles Magic OTP login for existing accounts', async () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={handleAuthSuccess} initialMode="signin" />);

    const emailInput = screen.getByLabelText(/Email Address/i);
    fireEvent.change(emailInput, { target: { value: 'dev@corez.pro' } });

    const magicOtpBtn = screen.getByRole('button', { name: /Sign in with Code/i });
    await act(async () => {
      fireEvent.click(magicOtpBtn);
    });

    // OTP view appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm & Log In/i })).toBeDefined();
    });

    // Click autofill
    const devAutofill = screen.getByText(/Click to Autofill/i);
    await act(async () => {
      fireEvent.click(devAutofill);
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Log In/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Email verified! Welcome/i)).toBeDefined();
      expect(handleAuthSuccess).toHaveBeenCalled();
    });
  });

  it('handles the Forgot and Reset Password flow', async () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={handleAuthSuccess} initialMode="signin" />);

    // Click Forgot?
    const forgotBtn = screen.getByRole('button', { name: /Forgot\?/i });
    await act(async () => {
      fireEvent.click(forgotBtn);
    });

    expect(screen.getByText(/Reset Your Password/i)).toBeDefined();
    const emailInput = screen.getByLabelText(/Account Email/i);
    fireEvent.change(emailInput, { target: { value: 'user@corez.pro' } });

    const sendCodeBtn = screen.getByRole('button', { name: /Send Reset Code/i });
    await act(async () => {
      fireEvent.click(sendCodeBtn);
    });

    // Reset password view should appear
    await waitFor(() => {
      expect(screen.getByText(/Set New Password/i)).toBeDefined();
      expect(screen.getByLabelText(/6-Digit Reset Code/i)).toBeDefined();
      expect(screen.getByLabelText(/New Password \(min 6 characters\)/i)).toBeDefined();
    });

    // Use Dev Mode autofill helper
    const devAutofill = screen.getAllByText(/Click to Autofill/i)[0];
    await act(async () => {
      fireEvent.click(devAutofill);
    });

    const newPassInput = screen.getByLabelText(/New Password \(min 6 characters\)/i);
    fireEvent.change(newPassInput, { target: { value: 'newsecurepass123' } });

    const updateBtn = screen.getByRole('button', { name: /Update Password & Sign In/i });
    await act(async () => {
      fireEvent.click(updateBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Password updated successfully!/i)).toBeDefined();
      expect(handleAuthSuccess).toHaveBeenCalled();
    });
  });
});
