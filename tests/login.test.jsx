// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Login from '../src/pages/Login.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Login / Signup Component', () => {
  it('renders login tab by default with email and password fields', () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    expect(screen.getByText('COREZ')).toBeTruthy();
    expect(screen.getByText('Sign in to your account')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@corez.pro')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Login$/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText('COREZ-INVITE-2026')).toBeNull();
  });

  it('switches to signup tab when Sign Up tab is clicked', () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    const signupTab = screen.getByRole('tab', { name: /^Sign Up$/i });
    fireEvent.click(signupTab);

    expect(screen.getByText('Closed Beta Registration')).toBeTruthy();
    expect(screen.getByPlaceholderText('COREZ-INVITE-2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Create Account$/i })).toBeTruthy();
  });

  it('toggles password visibility when eye icon is clicked', () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput.getAttribute('type')).toBe('password');

    const toggleBtn = screen.getByLabelText('Show password');
    fireEvent.click(toggleBtn);
    expect(passwordInput.getAttribute('type')).toBe('text');

    const hideBtn = screen.getByLabelText('Hide password');
    fireEvent.click(hideBtn);
    expect(passwordInput.getAttribute('type')).toBe('password');
  });

  it('displays error banner when authentication fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/auth/me')) {
        return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
      }
      if (String(url).includes('/api/auth/login')) {
        return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
      }
      return new Response(null, { status: 404 });
    });

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('you@corez.pro'), { target: { value: 'alice@corez.pro' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'WrongPassword123' } });
    fireEvent.click(screen.getByRole('button', { name: /^Login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Invalid email or password')).toBeTruthy();
    });
  });
});
