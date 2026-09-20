/**
 * Eco Tips Service
 *
 * Provides eco tips, facts, and daily recommendations.
 * Supports Appwrite Database with SQLite fallback.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');

/**
 * Get eco tips filtered by type, category, and limit.
 */
async function getTips({ type, category, count = 5 } = {}) {
  const limit = Math.min(parseInt(count, 10) || 5, 20);

  if (!USE_APPWRITE) {
    return _getTipsSQLite({ type, category, limit });
  }

  try {
    const db = getDatabases();
    const queries = [sdk.Query.equal('is_active', true), sdk.Query.limit(50)];

    if (type) queries.push(sdk.Query.equal('tip_type', type));
    if (category) queries.push(sdk.Query.equal('category', category));

    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.eco_tips, queries);
    let tips = res.documents.map(_normalizeTip);

    // Shuffle client-side to simulate RANDOM()
    tips = tips.sort(() => 0.5 - Math.random());
    return tips.slice(0, limit);
  } catch (err) {
    console.warn('[TipService] Appwrite tips failed, falling back to local:', err.message);
    return _getTipsSQLite({ type, category, limit });
  }
}

/**
 * Get a single random daily tip.
 */
async function getDailyTip() {
  const tips = await getTips({ count: 1 });
  return tips.length > 0 ? tips[0] : null;
}

function _normalizeTip(doc) {
  return {
    id: doc.$id || doc.id,
    category: doc.category,
    title: doc.title,
    content: doc.content,
    tip_type: doc.tip_type || 'general',
    is_active: doc.is_active === true || doc.is_active === 1,
  };
}

// ─── SQLite Fallbacks ─────────────────────────────────────────────────────────

function _getTipsSQLite({ type, category, limit }) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    let query = 'SELECT * FROM eco_tips WHERE is_active = 1';
    const params = [];

    if (type) { query += ' AND tip_type = ?'; params.push(type); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY RANDOM() LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  } catch {
    return [];
  }
}

module.exports = {
  getTips,
  getDailyTip,
};
