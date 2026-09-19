/**
 * Supabase backend client (server-side only)
 *
 * Uses the SERVICE_ROLE key — NEVER expose to frontend.
 * This client bypasses RLS and has full DB access.
 * Use only in backend route handlers / services.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — running in local SQLite mode');
}

let _client = null;

function getSupabaseAdmin() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

/**
 * Verify a Supabase Access Token from the Authorization header.
 * Returns { user } on success or throws.
 */
async function verifyToken(accessToken) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error('Invalid or expired token');
  return data.user;
}

module.exports = { getSupabaseAdmin, verifyToken };
