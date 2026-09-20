/**
 * AuthContext — Appwrite Authentication + Local Development Fallback
 *
 * Production Mode (Appwrite):
 *   - Uses Appwrite Web SDK for user authentication & session lifecycle.
 *   - Calls account.createJWT() to produce a signed session JWT.
 *   - Passes JWT as 'Authorization: Bearer <token>' to the Express API.
 *   - Syncs user profile details (points, level, streak, location) from /api/auth/me.
 *
 * Local Development Fallback (when VITE_APPWRITE_PROJECT_ID is not set):
 *   - Uses standard /api/auth/login and /api/auth/register with local JWT.
 *   - Enables offline development without requiring cloud credentials.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { account, isAppwriteConfigured } from '../services/appwriteClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Session Bootstrap on App Mount ─────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      if (isAppwriteConfigured && account) {
        try {
          // Check if Appwrite session exists
          const appwriteUser = await account.get();
          // Generate a session JWT for the backend
          const jwtRes = await account.createJWT();
          api.defaults.headers.common['Authorization'] = `Bearer ${jwtRes.jwt}`;

          // Fetch full application profile from backend
          try {
            const res = await api.get('/auth/me');
            if (isMounted) setUser(res.data);
          } catch {
            if (isMounted) {
              setUser({
                id:               appwriteUser.$id,
                email:            appwriteUser.email,
                name:             appwriteUser.name || appwriteUser.email?.split('@')[0],
                location_country: 'India',
                location_state:   '',
                location_city:    '',
                user_type:        'household',
                points:           0,
                level:            1,
                recycling_score:  0,
                streak_days:      0,
              });
            }
          }
        } catch {
          // No active Appwrite session
          if (isMounted) setUser(null);
        } finally {
          if (isMounted) setLoading(false);
        }
      } else {
        // Fallback: local JWT stored in localStorage
        const token = localStorage.getItem('token');
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          api.get('/auth/me')
            .then(res => {
              if (isMounted) setUser(res.data);
            })
            .catch(() => {
              localStorage.removeItem('token');
              delete api.defaults.headers.common['Authorization'];
              if (isMounted) setUser(null);
            })
            .finally(() => {
              if (isMounted) setLoading(false);
            });
        } else {
          if (isMounted) setLoading(false);
        }
      }
    }

    initSession();
    return () => { isMounted = false; };
  }, []);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    if (isAppwriteConfigured && account) {
      try {
        // Create session in Appwrite
        await account.createEmailPasswordSession(email, password);
        const jwtRes = await account.createJWT();
        api.defaults.headers.common['Authorization'] = `Bearer ${jwtRes.jwt}`;

        // Fetch application profile
        const res = await api.get('/auth/me');
        setUser(res.data);
        return res.data;
      } catch (err) {
        // If client-side session creation fails, attempt through backend auth
        try {
          const res = await api.post('/auth/login', { email, password });
          const { token, user: u } = res.data;
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setUser(u);
          return u;
        } catch (backendErr) {
          throw new Error(err.message || backendErr.response?.data?.error || 'Invalid credentials');
        }
      }
    } else {
      // Local fallback
      const res = await api.post('/auth/login', { email, password });
      const { token, user: u } = res.data;
      localStorage.setItem('token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(u);
      return u;
    }
  };

  // ── Register ────────────────────────────────────────────────────────────────
  const register = async (data) => {
    // Send registration to backend (creates Appwrite user & profile safely server-side)
    const res = await api.post('/auth/register', data);
    const { token, user: u } = res.data;

    if (token) {
      if (!isAppwriteConfigured) {
        localStorage.setItem('token', token);
      }
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // If Appwrite is configured, also create client session for web SDK
    if (isAppwriteConfigured && account) {
      try {
        await account.createEmailPasswordSession(data.email, data.password);
        const jwtRes = await account.createJWT();
        api.defaults.headers.common['Authorization'] = `Bearer ${jwtRes.jwt}`;
      } catch {
        // Server token already configured in api headers
      }
    }

    setUser(u);
    return u;
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = async () => {
    if (isAppwriteConfigured && account) {
      try {
        await account.deleteSession('current');
      } catch {
        /* ignore session deletion errors */
      }
    }
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  // ── Update User in Local State (e.g. after profile edit) ───────────────────
  const updateUser = (updates) => {
    setUser(prev => (prev ? { ...prev, ...updates } : null));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
