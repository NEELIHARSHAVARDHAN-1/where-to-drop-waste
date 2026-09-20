/**
 * Classification Service
 *
 * Stores and retrieves classification records.
 * Falls back to SQLite when Appwrite is not configured.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');
const { v4: uuidv4 } = require('uuid');

async function saveClassification(userId, method, inputText, imageFileId, result) {
  if (!USE_APPWRITE) return _saveClassificationSQLite(userId, method, inputText, imageFileId, result);

  const db = getDatabases();
  const id = uuidv4();
  const confidence = result.confidence || result.tf_confidence || 0;

  const doc = await db.createDocument(DATABASE_ID, COLLECTIONS.classifications, id, {
    user_id:        userId || null,
    input_text:     inputText || null,
    image_file_id:  imageFileId || null,
    method,
    matched_item_id: result.item_id || null,
    category:       result.category || 'Unknown',
    recyclable:     result.recyclable || 'unknown',
    disposal_method: result.disposal_method || '',
    confidence,
    user_confirmed: false,
    user_correction: null,
    points_awarded: 0,
    timestamp:      new Date().toISOString(),
  });

  return doc.$id;
}

async function getClassification(classificationId) {
  if (!USE_APPWRITE) return _getClassificationSQLite(classificationId);

  try {
    const db = getDatabases();
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.classifications, classificationId);
    return _normalizeClassification(doc);
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

async function updateClassification(classificationId, updates) {
  if (!USE_APPWRITE) return _updateClassificationSQLite(classificationId, updates);

  const db = getDatabases();
  await db.updateDocument(DATABASE_ID, COLLECTIONS.classifications, classificationId, updates);
}

async function getUserClassificationHistory(userId, page = 1, limit = 20) {
  if (!USE_APPWRITE) return _getHistorySQLite(userId, page, limit);

  const db = getDatabases();
  const offset = (page - 1) * limit;

  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.orderDesc('timestamp'),
    sdk.Query.limit(limit),
    sdk.Query.offset(offset),
  ]);

  return {
    items: res.documents.map(_normalizeClassification),
    total: res.total,
    page,
    limit,
    pages: Math.ceil(res.total / limit),
  };
}

async function countUserClassifications(userId) {
  if (!USE_APPWRITE) return _countSQLite(userId);

  const db = getDatabases();
  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.limit(1),
  ]);
  return res.total;
}

async function getCategoryBreakdown(userId) {
  if (!USE_APPWRITE) return _getCategoryBreakdownSQLite(userId);

  const db = getDatabases();
  // Appwrite doesn't support GROUP BY — fetch all and group in JS
  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.limit(5000),
    sdk.Query.select(['category']),
  ]);

  const counts = {};
  for (const doc of res.documents) {
    counts[doc.category] = (counts[doc.category] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

async function getWeeklyActivity(userId) {
  if (!USE_APPWRITE) return _getWeeklyActivitySQLite(userId);

  const db = getDatabases();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.greaterThanEqual('timestamp', sevenDaysAgo),
    sdk.Query.limit(5000),
    sdk.Query.select(['timestamp']),
  ]);

  const counts = {};
  for (const doc of res.documents) {
    const day = doc.timestamp.split('T')[0];
    counts[day] = (counts[day] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function _normalizeClassification(doc) {
  return {
    id:              doc.$id,
    user_id:         doc.user_id,
    input_text:      doc.input_text,
    image_file_id:   doc.image_file_id || doc.image_path,
    method:          doc.method,
    matched_item_id: doc.matched_item_id,
    category:        doc.category,
    recyclable:      doc.recyclable,
    disposal_method: doc.disposal_method,
    confidence:      doc.confidence || 0,
    user_confirmed:  doc.user_confirmed || false,
    user_correction: doc.user_correction,
    points_awarded:  doc.points_awarded || 0,
    timestamp:       doc.timestamp || doc.$createdAt,
  };
}

// ─── SQLite fallbacks ──────────────────────────────────────────────────────────

function _saveClassificationSQLite(userId, method, inputText, imagePath, result) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const id = uuidv4();
  const confidence = result.confidence || result.tf_confidence || 0;
  db.prepare(`
    INSERT INTO classifications 
    (id, user_id, input_text, image_path, method, matched_item_id, category, recyclable, disposal_method, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId || null, inputText || null, imagePath || null, method,
    result.item_id || null, result.category, result.recyclable, result.disposal_method, confidence);
  return id;
}

function _getClassificationSQLite(id) {
  const { getDb } = require('../database/db');
  return getDb().prepare('SELECT * FROM classifications WHERE id = ?').get(id) || null;
}

function _updateClassificationSQLite(id, updates) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const allowed = ['user_confirmed', 'user_correction', 'points_awarded'];
  const filtered = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) filtered[k] = updates[k];
  }
  if (Object.keys(filtered).length === 0) return;
  const setClause = Object.keys(filtered).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE classifications SET ${setClause} WHERE id = ?`).run(...Object.values(filtered), id);
}

function _getHistorySQLite(userId, page, limit) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const offset = (page - 1) * limit;
  const items = db.prepare(
    'SELECT * FROM classifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(userId, limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM classifications WHERE user_id = ?').get(userId).count;
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

function _countSQLite(userId) {
  const { getDb } = require('../database/db');
  return getDb().prepare('SELECT COUNT(*) as c FROM classifications WHERE user_id = ?').get(userId)?.c || 0;
}

function _getCategoryBreakdownSQLite(userId) {
  const { getDb } = require('../database/db');
  return getDb().prepare(
    'SELECT category, COUNT(*) as count FROM classifications WHERE user_id = ? GROUP BY category ORDER BY count DESC'
  ).all(userId);
}

function _getWeeklyActivitySQLite(userId) {
  const { getDb } = require('../database/db');
  return getDb().prepare(`
    SELECT date(timestamp) as day, COUNT(*) as count 
    FROM classifications WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')
    GROUP BY date(timestamp) ORDER BY day ASC
  `).all(userId);
}

module.exports = {
  saveClassification,
  getClassification,
  updateClassification,
  getUserClassificationHistory,
  countUserClassifications,
  getCategoryBreakdown,
  getWeeklyActivity,
};
