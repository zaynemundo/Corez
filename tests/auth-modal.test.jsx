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
  it('renders Sign In tab by default and switches to Create Account tab', () => {
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={() => {}} />);

    const signInTab = screen.getByRole('tab', { name: /Switch to Sign In tab/i });
    const createTab = screen.getByRole('tab', { name: /Switch to Create Account tab/i });
    expect(signInTab).toBeDefined();
    expect(createTab).toBeDefined();

    // Switch to Create Account
    fireEvent.click(createTab);
    expect(screen.getByLabelText(/Your Name/i)).toBeDefined();
    expect(screen.getByLabelText(/Password \(min 6 chars\)/i)).toBeDefined();
  });

  it('completes the Create Account signup flow successfully', async () => {
    const handleAuthSuccess = vi.fn();
    render(<AuthModal isOpen={true} onClose={() => {}} onAuthSuccess={handleAuthSuccess} initialMode="signup" />);

    const nameInput = screen.getByLabelText(/Your Name/i);
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passInput = screen.getByLabelText(/Password/i);

    fireEvent.change(nameInput, { target: { value: 'Sam Smith' } });
    fireEvent.change(emailInput, { target: { value: 'sam@corez.pro' } });
    fireEvent.change(passInput, { target: { value: 'secretpass123' } });

    const submitBtn = screen.getByRole('button', { name: /Submit create account/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Success message displayed
    await waitFor(() => {
      expect(screen.getByText(/Account created!/i)).toBeDefined();
    });
  });
});
