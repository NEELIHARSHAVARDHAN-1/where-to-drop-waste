/**
 * Impact Service (Appwrite-backed)
 *
 * Stores environmental impact records.
 * Falls back to SQLite when Appwrite is not configured.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');
const { v4: uuidv4 } = require('uuid');
const { IMPACT_FACTORS, calculateImpact, aggregateImpacts } = require('./impactService');

async function saveImpact(userId, classificationId, category, weightGrams) {
  if (!USE_APPWRITE) return _saveImpactSQLite(userId, classificationId, category, weightGrams);

  const impact = calculateImpact(category, weightGrams);
  const db = getDatabases();

  await db.createDocument(DATABASE_ID, COLLECTIONS.impacts, uuidv4(), {
    user_id:           userId,
    classification_id: classificationId || null,
    waste_category:    category,
    weight_grams:      impact.weight_grams,
    co2_saved_grams:   impact.co2_saved_grams,
    water_saved_ml:    impact.water_saved_ml,
    energy_saved_wh:   impact.energy_saved_wh,
    timestamp:         new Date().toISOString(),
  });

  return impact;
}

async function getUserImpacts(userId) {
  if (!USE_APPWRITE) return _getUserImpactsSQLite(userId);

  const db = getDatabases();
  const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.impacts, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.orderDesc('timestamp'),
    sdk.Query.limit(5000),
  ]);

  return res.documents.map(doc => ({
    id:                doc.$id,
    user_id:           doc.user_id,
    classification_id: doc.classification_id,
    waste_category:    doc.waste_category,
    weight_grams:      doc.weight_grams,
    co2_saved_grams:   doc.co2_saved_grams,
    water_saved_ml:    doc.water_saved_ml,
    energy_saved_wh:   doc.energy_saved_wh,
    timestamp:         doc.timestamp || doc.$createdAt,
  }));
}

async function getUserImpactByCategory(userId) {
  if (!USE_APPWRITE) return _getByCategory(userId);

  const impacts = await getUserImpacts(userId);

  const grouped = {};
  for (const i of impacts) {
    if (!grouped[i.waste_category]) {
      grouped[i.waste_category] = { waste_category: i.waste_category, item_count: 0, co2_grams: 0, water_ml: 0, energy_wh: 0 };
    }
    grouped[i.waste_category].item_count++;
    grouped[i.waste_category].co2_grams   += i.co2_saved_grams || 0;
    grouped[i.waste_category].water_ml    += i.water_saved_ml  || 0;
    grouped[i.waste_category].energy_wh   += i.energy_saved_wh || 0;
  }

  return Object.values(grouped).sort((a, b) => b.co2_grams - a.co2_grams);
}

// ─── SQLite fallbacks ─────────────────────────────────────────────────────────

function _saveImpactSQLite(userId, classificationId, category, weightGrams) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const impact = calculateImpact(category, weightGrams);
  db.prepare(`
    INSERT INTO impacts (id, user_id, classification_id, waste_category, weight_grams, co2_saved_grams, water_saved_ml, energy_saved_wh)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, classificationId || null, category, impact.weight_grams, impact.co2_saved_grams, impact.water_saved_ml, impact.energy_saved_wh);
  return impact;
}

function _getUserImpactsSQLite(userId) {
  const { getDb } = require('../database/db');
  return getDb().prepare('SELECT * FROM impacts WHERE user_id = ? ORDER BY timestamp DESC').all(userId);
}

function _getByCategory(userId) {
  const { getDb } = require('../database/db');
  const db = getDb();
  return db.prepare(`
    SELECT waste_category, 
      COUNT(*) as item_count,
      SUM(co2_saved_grams) as co2_grams,
      SUM(water_saved_ml) as water_ml,
      SUM(energy_saved_wh) as energy_wh
    FROM impacts WHERE user_id = ? 
    GROUP BY waste_category ORDER BY co2_grams DESC
  `).all(userId);
}

module.exports = { saveImpact, getUserImpacts, getUserImpactByCategory };
