/**
 * Supabase browser client
 *
 * Uses the ANON/PUBLISHABLE key only — safe to expose in frontend.
 * All user-sensitive data is protected by Row Level Security (RLS).
 *
 * NEVER import SUPABASE_SERVICE_ROLE_KEY here.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env vars are missing (e.g. local dev without Supabase),
// the client will be null and AuthContext falls back to custom JWT.
let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} else {
  console.info('[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using local JWT mode');
}

export default supabase;
