/**
 * Waste Items Service
 *
 * Provides waste item lookups and category queries.
 * Supports Appwrite Database with SQLite fallback.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');

/**
 * List waste items with optional filtering by category, search term, or recyclable flag.
 */
async function getWasteItems({ category, search, recyclable } = {}) {
  if (!USE_APPWRITE) {
    return _getWasteItemsSQLite({ category, search, recyclable });
  }

  try {
    const db = getDatabases();
    const queries = [sdk.Query.limit(100)];

    if (category) {
      queries.push(sdk.Query.equal('category', category));
    }
    if (recyclable) {
      queries.push(sdk.Query.equal('recyclable', recyclable));
    }
    if (search) {
      queries.push(sdk.Query.search('name', search));
    }

    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.waste_items, queries);
    return res.documents.map(_normalizeWasteItem);
  } catch (err) {
    console.warn('[WasteItemService] Appwrite query failed, falling back to local:', err.message);
    return _getWasteItemsSQLite({ category, search, recyclable });
  }
}

/**
 * Retrieve all unique waste categories.
 */
async function getWasteCategories() {
  if (!USE_APPWRITE) {
    return _getWasteCategoriesSQLite();
  }

  try {
    const db = getDatabases();
    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.waste_items, [
      sdk.Query.limit(100),
      sdk.Query.select(['category']),
    ]);

    const categories = Array.from(new Set(res.documents.map(d => d.category).filter(Boolean)));
    return categories.sort();
  } catch (err) {
    console.warn('[WasteItemService] Appwrite categories failed, falling back to local:', err.message);
    return _getWasteCategoriesSQLite();
  }
}

/**
 * Get a single waste item by its ID.
 */
async function getWasteItemById(id) {
  if (!USE_APPWRITE) {
    return _getWasteItemByIdSQLite(id);
  }

  try {
    const db = getDatabases();
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.waste_items, id);
    return _normalizeWasteItem(doc);
  } catch (err) {
    if (err.code === 404) return null;
    return _getWasteItemByIdSQLite(id);
  }
}

/**
 * Get a waste item template by category.
 */
async function getWasteItemByCategory(category) {
  if (!USE_APPWRITE) {
    return _getWasteItemByCategorySQLite(category);
  }

  try {
    const db = getDatabases();
    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.waste_items, [
      sdk.Query.equal('category', category),
      sdk.Query.limit(1),
    ]);

    if (res.documents.length > 0) {
      return _normalizeWasteItem(res.documents[0]);
    }
    return null;
  } catch {
    return _getWasteItemByCategorySQLite(category);
  }
}

function _normalizeWasteItem(doc) {
  return {
    id: doc.$id || doc.id,
    name: doc.name,
    aliases: typeof doc.aliases === 'string' ? doc.aliases : JSON.stringify(doc.aliases || []),
    category: doc.category,
    recyclable: doc.recyclable,
    bin_color: doc.bin_color || 'grey',
    bin_label: doc.bin_label || 'General Waste',
    disposal_method: doc.disposal_method,
    preparation_instructions: doc.preparation_instructions || '',
    sustainability_info: doc.sustainability_info || '',
    estimated_weight_grams: doc.estimated_weight_grams || 50,
    co2_factor: doc.co2_factor || 0,
    water_factor: doc.water_factor || 0,
    energy_factor: doc.energy_factor || 0,
    created_at: doc.created_at || doc.$createdAt,
  };
}

// ─── SQLite Fallbacks ─────────────────────────────────────────────────────────

function _getWasteItemsSQLite({ category, search, recyclable }) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    let query = 'SELECT * FROM waste_items WHERE 1=1';
    const params = [];

    if (category) { query += ' AND category = ?'; params.push(category); }
    if (recyclable) { query += ' AND recyclable = ?'; params.push(recyclable); }
    if (search) {
      query += ' AND (name LIKE ? OR aliases LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY name ASC';

    return db.prepare(query).all(...params);
  } catch {
    return [];
  }
}

function _getWasteCategoriesSQLite() {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT DISTINCT category FROM waste_items ORDER BY category').all().map(r => r.category);
  } catch {
    return [];
  }
}

function _getWasteItemByIdSQLite(id) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT * FROM waste_items WHERE id = ?').get(id) || null;
  } catch {
    return null;
  }
}

function _getWasteItemByCategorySQLite(category) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT * FROM waste_items WHERE category = ? LIMIT 1').get(category) || null;
  } catch {
    return null;
  }
}

module.exports = {
  getWasteItems,
  getWasteCategories,
  getWasteItemById,
  getWasteItemByCategory,
};
