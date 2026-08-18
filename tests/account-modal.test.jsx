// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import React from 'react';
import AccountModal from '../src/components/AccountModal.jsx';
import { DEFAULT_ACCOUNT_PROFILE } from '../src/services/accountService.js';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

describe('AccountModal Component', () => {
  it('renders modal with user profile details and tabs', () => {
    render(
      <AccountModal
        isOpen={true}
        onClose={() => {}}
        profile={DEFAULT_ACCOUNT_PROFILE}
        onProfileUpdate={() => {}}
        sessions={[]}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Account & Profile Settings' })).toBeDefined();
    expect(screen.getByText('Creator')).toBeDefined();
    expect(screen.getByRole('button', { name: /Profile/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Preferences/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Usage & Plan/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Data & Privacy/i })).toBeDefined();
  });

  it('updates and saves profile information', () => {
    const handleUpdate = vi.fn();
    render(
      <AccountModal
        isOpen={true}
        onClose={() => {}}
        profile={DEFAULT_ACCOUNT_PROFILE}
        onProfileUpdate={handleUpdate}
        sessions={[]}
      />
    );

    const nameInput = screen.getByLabelText('Display Name');
    fireEvent.change(nameInput, { target: { value: 'Jordan Hayes' } });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    expect(handleUpdate).toHaveBeenCalled();
    const calledProfile = handleUpdate.mock.calls[0][0];
    expect(calledProfile.displayName).toBe('Jordan Hayes');
  });

  it('switches to Preferences, Usage, and Data tabs', () => {
    render(
      <AccountModal
        isOpen={true}
        onClose={() => {}}
        profile={DEFAULT_ACCOUNT_PROFILE}
        onProfileUpdate={() => {}}
        sessions={[{ id: '1', messages: [{ role: 'user' }] }]}
      />
    );

    // Switch to Preferences
    fireEvent.click(screen.getByRole('button', { name: /Preferences/i }));
    expect(screen.getByText('Default Design System Archetype')).toBeDefined();

    // Switch to Usage & Plan
    fireEvent.click(screen.getByRole('button', { name: /Usage & Plan/i }));
    expect(screen.getByText('Pro Creator Tier Active')).toBeDefined();
    expect(screen.getByText('Active Conversations')).toBeDefined();

    // Switch to Data & Privacy
    fireEvent.click(screen.getByRole('button', { name: /Data & Privacy/i }));
    expect(screen.getByText('Export Account Data & Chat History')).toBeDefined();
    expect(screen.getByRole('button', { name: /Download Backup/i })).toBeDefined();
  });
});
