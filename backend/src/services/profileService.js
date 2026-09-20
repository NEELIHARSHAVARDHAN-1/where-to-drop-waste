/**
 * Profile Service
 *
 * Manages user profile data in Appwrite Database.
 * The Appwrite Auth user ID is the canonical identity.
 * Profile documents store application-specific data (points, level, etc.)
 *
 * Falls back to SQLite via getDb() when Appwrite is not configured.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');
const { v4: uuidv4 } = require('uuid');

// ─── Appwrite helpers ─────────────────────────────────────────────────────────

/**
 * Get a profile document by Appwrite user ID.
 * The document ID is set equal to the user ID for easy lookup.
 */
async function getProfile(userId) {
  if (!USE_APPWRITE) return _getProfileSQLite(userId);

  try {
    const db = getDatabases();
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.profiles, userId);
    return _normalizeProfile(doc);
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

/**
 * Create a new profile document for a newly registered user.
 */
async function createProfile(userId, data) {
  if (!USE_APPWRITE) return _createProfileSQLite(userId, data);

  const db = getDatabases();
  const now = new Date().toISOString();

  const doc = await db.createDocument(
    DATABASE_ID,
    COLLECTIONS.profiles,
    userId, // document ID = user ID
    {
      user_id:          userId,
      name:             data.name || '',
      email:            data.email || '',
      location_country: data.location_country || 'India',
      location_state:   data.location_state   || '',
      location_city:    data.location_city    || '',
      user_type:        data.user_type        || 'household',
      points:           0,
      level:            1,
      recycling_score:  0,
      streak_days:      0,
      last_activity_date: null,
      created_at:       now,
      updated_at:       now,
    }
  );
  return _normalizeProfile(doc);
}

/**
 * Update profile fields.
 */
async function updateProfile(userId, updates) {
  if (!USE_APPWRITE) return _updateProfileSQLite(userId, updates);

  const db = getDatabases();
  const doc = await db.updateDocument(
    DATABASE_ID,
    COLLECTIONS.profiles,
    userId,
    { ...updates, updated_at: new Date().toISOString() }
  );
  return _normalizeProfile(doc);
}

/**
 * Get a ranked leaderboard list ordered by points descending.
 */
async function getLeaderboard(limit = 10) {
  if (!USE_APPWRITE) return _getLeaderboardSQLite(limit);

  const db = getDatabases();
  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.profiles, [
    sdk.Query.orderDesc('points'),
    sdk.Query.limit(limit),
    sdk.Query.select(['$id', 'name', 'points', 'level', 'recycling_score', 'streak_days']),
  ]);

  return res.documents.map((doc, i) => ({
    id:              doc.$id,
    name:            doc.name,
    points:          doc.points,
    level:           doc.level,
    recycling_score: doc.recycling_score,
    streak_days:     doc.streak_days,
    rank:            i + 1,
  }));
}

function _normalizeProfile(doc) {
  return {
    id:               doc.$id || doc.user_id,
    user_id:          doc.user_id   || doc.$id,
    name:             doc.name,
    email:            doc.email,
    location_country: doc.location_country,
    location_state:   doc.location_state,
    location_city:    doc.location_city,
    user_type:        doc.user_type,
    points:           doc.points    || 0,
    level:            doc.level     || 1,
    recycling_score:  doc.recycling_score || 0,
    streak_days:      doc.streak_days    || 0,
    last_activity_date: doc.last_activity_date || null,
    created_at:       doc.created_at || doc.$createdAt,
    updated_at:       doc.updated_at || doc.$updatedAt,
  };
}

// ─── SQLite fallback helpers ──────────────────────────────────────────────────

function _getProfileSQLite(userId) {
  const { getDb } = require('../database/db');
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

function _createProfileSQLite(userId, data) {
  const { getDb } = require('../database/db');
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, location_country, location_state, location_city, user_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    data.name || '',
    data.email || '',
    data.password_hash || '',
    data.location_country || 'India',
    data.location_state || '',
    data.location_city || '',
    data.user_type || 'household'
  );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function _updateProfileSQLite(userId, updates) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const allowed = ['name', 'location_country', 'location_state', 'location_city', 'user_type',
                   'points', 'level', 'recycling_score', 'streak_days', 'last_activity_date'];
  const filtered = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) filtered[k] = updates[k];
  }
  if (Object.keys(filtered).length === 0) return _getProfileSQLite(userId);
  const setClause = Object.keys(filtered).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...Object.values(filtered), userId);
  return _getProfileSQLite(userId);
}

function _getLeaderboardSQLite(limit) {
  const { getDb } = require('../database/db');
  const db = getDb();
  return db.prepare(`
    SELECT id, name, points, level, recycling_score, streak_days
    FROM users ORDER BY points DESC LIMIT ?
  `).all(limit).map((u, i) => ({ ...u, rank: i + 1 }));
}

module.exports = { getProfile, createProfile, updateProfile, getLeaderboard };
