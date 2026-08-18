// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import React from 'react';
import QuotaLimitModal from '../src/components/QuotaLimitModal.jsx';
import ChatInput from '../src/components/ChatInput.jsx';

afterEach(cleanup);

describe('Quota Limit UI & Modal', () => {
  it('renders QuotaLimitModal for message limit and triggers signup/signin handlers', () => {
    const handleOpenSignUp = vi.fn();
    const handleOpenSignIn = vi.fn();
    const handleClose = vi.fn();

    render(
      <QuotaLimitModal
        isOpen={true}
        onClose={handleClose}
        onOpenSignUp={handleOpenSignUp}
        onOpenSignIn={handleOpenSignIn}
        action="message"
      />
    );

    expect(screen.getByText('Daily Guest Limit Reached')).toBeDefined();
    expect(screen.getByText(/You have used all 5 free guest prompts for today/i)).toBeDefined();

    // Value props
    expect(screen.getByText(/Unlimited AI prompts/i)).toBeDefined();
    expect(screen.getByText(/Instant web publishing/i)).toBeDefined();

    // Sign up button
    const signUpBtn = screen.getByRole('button', { name: /Create Free Account/i });
    fireEvent.click(signUpBtn);
    expect(handleClose).toHaveBeenCalled();
    expect(handleOpenSignUp).toHaveBeenCalled();

    // Sign in button
    const signInBtn = screen.getByRole('button', { name: /Already have an account\? Sign In/i });
    fireEvent.click(signInBtn);
    expect(handleOpenSignIn).toHaveBeenCalled();
  });

  it('renders QuotaLimitModal for publish action', () => {
    render(
      <QuotaLimitModal
        isOpen={true}
        onClose={() => {}}
        onOpenSignUp={() => {}}
        onOpenSignIn={() => {}}
        action="publish"
      />
    );

    expect(screen.getByText('Publishing Limit Reached')).toBeDefined();
    expect(screen.getByText(/Guests can publish 1 free creation per day/i)).toBeDefined();
  });

  it('renders guest quota indicator pill in ChatInput when unauthenticated', () => {
    const handleOpenAuth = vi.fn();
    render(
      <ChatInput
        input=""
        setInput={() => {}}
        onSendMessage={() => {}}
        onStopMessage={() => {}}
        isStreaming={false}
        guestQuota={{ isGuest: true, remaining: 3, limit: 5 }}
        onOpenAuth={handleOpenAuth}
      />
    );

    expect(screen.getByText(/Guest Mode:/i)).toBeDefined();
    expect(screen.getByText(/3 of 5 free prompts/i)).toBeDefined();

    const upgradeLink = screen.getByRole('button', { name: /Sign up for unlimited/i });
    fireEvent.click(upgradeLink);
    expect(handleOpenAuth).toHaveBeenCalled();
  });
});
