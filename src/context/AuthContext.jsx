import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d.error || 'Login failed');
    setUser(d.user);
    return d.user;
  };

  const signup = async (email, password, inviteCode) => {
    const r = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, inviteCode })
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d.error || 'Signup failed');
    setUser(d.user);
    return d.user;
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const forgot = async (email) => {
    const r = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d.error || 'Failed to send reset email');
    return d;
  };

  const reset = async (token, password) => {
    const r = await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password })
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(d.error || 'Failed to reset password');
    return d;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, forgot, reset, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be inside AuthProvider');
  return v;
}
