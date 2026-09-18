// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsModal from '../src/components/SettingsModal.jsx';

// Regression guard: App always mounts SettingsModal (isOpen=false), so the
// component must run the same hooks closed and open. The previous early
// return before useAuth/useState/useEffect/useNavigate made the first open
// throw "Rendered more hooks than during the previous render" and dropped the
// whole app into the ErrorBoundary.

function stubSubscriptions() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ plan: 'free', status: 'active' }),
    })),
  );
}

function renderModal(isOpen) {
  return render(
    <MemoryRouter>
      <SettingsModal
        isOpen={isOpen}
        onClose={() => {}}
        onClearAllHistory={() => {}}
        theme="dark"
        onToggleTheme={() => {}}
      />
    </MemoryRouter>,
  );
}

describe('SettingsModal hooks discipline', () => {
  beforeEach(stubSubscriptions);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing while closed without registering a different hook order', () => {
    const { container } = renderModal(false);
    expect(container.textContent).toBe('');
  });

  it('opens after being mounted closed (no hook-order crash)', () => {
    const { rerender } = renderModal(false);
    rerender(
      <MemoryRouter>
        <SettingsModal
          isOpen
          onClose={() => {}}
          onClearAllHistory={() => {}}
          theme="dark"
          onToggleTheme={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Plan & Billing')).toBeTruthy();
  });

  it('survives closing and reopening repeatedly', () => {
    const { rerender } = renderModal(true);
    for (let i = 0; i < 3; i += 1) {
      rerender(
        <MemoryRouter>
          <SettingsModal
            isOpen={false}
            onClose={() => {}}
            onClearAllHistory={() => {}}
            theme="dark"
            onToggleTheme={() => {}}
          />
        </MemoryRouter>,
      );
      rerender(
        <MemoryRouter>
          <SettingsModal
            isOpen
            onClose={() => {}}
            onClearAllHistory={() => {}}
            theme="dark"
            onToggleTheme={() => {}}
          />
        </MemoryRouter>,
      );
    }
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });
});
