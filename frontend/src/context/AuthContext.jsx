/**
 * AuthContext — supports both Supabase Auth and the existing custom JWT backend.
 *
 * Behavior:
 *   - If VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set → uses Supabase Auth.
 *     The Supabase access_token is forwarded to the backend as Bearer token.
 *     Backend verifies it via supabase.auth.getUser(token).
 *
 *   - If Supabase env vars are NOT set → falls back to the original custom JWT
 *     flow (POST /auth/login → { token, user }). This keeps local development
 *     working without any Supabase project.
 *
 * The rest of the application consumes { user, loading, login, register, logout, updateUser }
 * exactly as before — no other components need to change.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import supabase from '../services/supabaseClient';

const AuthContext = createContext(null);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a Supabase user + profile into the shape the app expects */
function buildUserFromSupabase(supabaseUser, profile) {
  return {
    id:               supabaseUser.id,
    email:            supabaseUser.email,
    name:             profile?.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
    location_country: profile?.location_country || 'India',
    location_state:   profile?.location_state   || '',
    location_city:    profile?.location_city    || '',
    user_type:        profile?.user_type        || 'household',
    points:           profile?.points           || 0,
    level:            profile?.level            || 1,
    recycling_score:  profile?.recycling_score  || 0,
    streak_days:      profile?.streak_days      || 0,
    _source: 'supabase',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const useSupabase = !!supabase;

  // ── Bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (useSupabase) {
      // Supabase session bootstrap
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session) {
          await syncSupabaseSession(session);
        }
        setLoading(false);
      });

      // Listen for auth state changes (login, logout, token refresh)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session) {
            await syncSupabaseSession(session);
          } else {
            setUser(null);
            delete api.defaults.headers.common['Authorization'];
          }
        }
      );
      return () => subscription.unsubscribe();

    } else {
      // Legacy custom JWT bootstrap
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        api.get('/auth/me')
          .then(res => setUser(res.data))
          .catch(() => {
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
          })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch profile from Supabase and sync access token to api client
  async function syncSupabaseSession(session) {
    // Forward access_token to backend for protected routes
    api.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;

    // Fetch profile row (contains points, level, etc.)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    setUser(buildUserFromSupabase(session.user, profile));
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    if (useSupabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      await syncSupabaseSession(data.session);
      return user;
    } else {
      const res = await api.post('/auth/login', { email, password });
      const { token, user: u } = res.data;
      localStorage.setItem('token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(u);
      return u;
    }
  };

  // ── Register ──────────────────────────────────────────────────────────────
  const register = async (data) => {
    if (useSupabase) {
      const { name, email, password, location_country, location_state, location_city, user_type } = data;
      const { data: authData, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw new Error(error.message);

      // Update the auto-created profile with additional fields
      if (authData.user) {
        await supabase.from('profiles').update({
          name,
          location_country: location_country || 'India',
          location_state:   location_state   || '',
          location_city:    location_city    || '',
          user_type:        user_type        || 'household',
        }).eq('id', authData.user.id);
      }

      if (authData.session) {
        await syncSupabaseSession(authData.session);
      }
      return user;
    } else {
      const res = await api.post('/auth/register', data);
      const { token, user: u } = res.data;
      localStorage.setItem('token', token);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(u);
      return u;
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    if (useSupabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('token');
    }
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  // ── Update user in local state (e.g. after profile edit) ─────────────────
  const updateUser = (updates) => {
    setUser(prev => ({ ...prev, ...updates }));
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
