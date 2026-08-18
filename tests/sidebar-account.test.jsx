// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import React from 'react';
import Sidebar from '../src/components/Sidebar.jsx';
import { DEFAULT_ACCOUNT_PROFILE } from '../src/services/accountService.js';

afterEach(cleanup);

describe('Sidebar Account Profile Pill', () => {
  it('renders account profile pill and opens account modal on click', () => {
    const handleOpenAccount = vi.fn();
    render(
      <Sidebar
        isOpen={true}
        sessions={[]}
        activeSessionId="s1"
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenSettings={() => {}}
        onDeleteSession={() => {}}
        activeView="chat"
        theme="dark"
        onToggleTheme={() => {}}
        onCloseSidebar={() => {}}
        accountProfile={DEFAULT_ACCOUNT_PROFILE}
        onOpenAccount={handleOpenAccount}
      />
    );

    const accountPill = screen.getByRole('button', { name: /Account profile for Creator/i });
    expect(accountPill).toBeDefined();
    expect(screen.getByText('Creator')).toBeDefined();
    expect(screen.getByText('@creator')).toBeDefined();
    expect(screen.getByText('Pro Creator')).toBeDefined();

    fireEvent.click(accountPill);
    expect(handleOpenAccount).toHaveBeenCalled();
  });
});
