/**
 * Appwrite Server-Side Configuration
 *
 * Uses the Appwrite Node.js SDK (node-appwrite).
 * The API key is SERVER-SIDE ONLY — never expose to frontend.
 *
 * Provides reusable, singleton client instances for:
 *   - Appwrite Client (authenticated with API key)
 *   - Users API (account management)
 *   - Databases API (structured data)
 *   - Storage API (file/image storage)
 */

'use strict';

const sdk = require('node-appwrite');

const ENDPOINT   = process.env.APPWRITE_ENDPOINT   || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;

if (!PROJECT_ID || !API_KEY) {
  console.warn(
    '[Appwrite] APPWRITE_PROJECT_ID or APPWRITE_API_KEY not set — ' +
    'running in local SQLite fallback mode.'
  );
}

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!PROJECT_ID || !API_KEY) return null;

  _client = new sdk.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

  return _client;
}

// ─── Service accessors ────────────────────────────────────────────────────────

let _users = null;
let _databases = null;
let _storage = null;

function getUsers() {
  if (_users) return _users;
  const c = getClient();
  if (!c) return null;
  _users = new sdk.Users(c);
  return _users;
}

function getDatabases() {
  if (_databases) return _databases;
  const c = getClient();
  if (!c) return null;
  _databases = new sdk.Databases(c);
  return _databases;
}

function getStorage() {
  if (_storage) return _storage;
  const c = getClient();
  if (!c) return null;
  _storage = new sdk.Storage(c);
  return _storage;
}

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const BUCKET_ID   = process.env.APPWRITE_STORAGE_BUCKET_ID;

// Collection IDs — set via environment or use well-known defaults
const COLLECTIONS = {
  profiles:             process.env.APPWRITE_COL_PROFILES            || 'profiles',
  classifications:      process.env.APPWRITE_COL_CLASSIFICATIONS      || 'classifications',
  impacts:              process.env.APPWRITE_COL_IMPACTS              || 'impacts',
  badges:               process.env.APPWRITE_COL_BADGES               || 'badges',
  user_badges:          process.env.APPWRITE_COL_USER_BADGES          || 'user_badges',
  challenges:           process.env.APPWRITE_COL_CHALLENGES           || 'challenges',
  user_challenges:      process.env.APPWRITE_COL_USER_CHALLENGES      || 'user_challenges',
  local_rules:          process.env.APPWRITE_COL_LOCAL_RULES          || 'local_rules',
  eco_tips:             process.env.APPWRITE_COL_ECO_TIPS             || 'eco_tips',
  waste_items:          process.env.APPWRITE_COL_WASTE_ITEMS          || 'waste_items',
  user_corrections:     process.env.APPWRITE_COL_USER_CORRECTIONS     || 'user_corrections',
  training_candidates:  process.env.APPWRITE_COL_TRAINING_CANDIDATES  || 'training_candidates',
  admin_users:          process.env.APPWRITE_COL_ADMIN_USERS          || 'admin_users',
};

const USE_APPWRITE = !!(PROJECT_ID && API_KEY && DATABASE_ID);

module.exports = {
  sdk,
  getClient,
  getUsers,
  getDatabases,
  getStorage,
  DATABASE_ID,
  BUCKET_ID,
  COLLECTIONS,
  USE_APPWRITE,
};
