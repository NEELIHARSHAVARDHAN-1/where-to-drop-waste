/**
 * Local Rules Service
 *
 * Provides localized waste management rules with hierarchical matching
 * (City > State > Country).
 * Supports Appwrite Database with SQLite fallback.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');

/**
 * Get all matching rules for given criteria.
 */
async function getLocalRules({ country, state, city, category } = {}) {
  if (!USE_APPWRITE) {
    return _getLocalRulesSQLite({ country, state, city, category });
  }

  try {
    const db = getDatabases();
    const queries = [sdk.Query.equal('country', country), sdk.Query.limit(100)];

    if (category) {
      queries.push(sdk.Query.equal('category', category));
    }

    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.local_rules, queries);
    let rules = res.documents.map(_normalizeRule);

    // Apply client-side filtering for state / city
    if (state) {
      rules = rules.filter(r => !r.state || r.state === state);
    }
    if (city) {
      rules = rules.filter(r => !r.city || r.city === city);
    }

    // Sort hierarchically: city matches first, then state, then country
    rules.sort((a, b) => {
      const scoreA = (a.city && a.city === city ? 4 : 0) + (a.state && a.state === state ? 2 : 0);
      const scoreB = (b.city && b.city === city ? 4 : 0) + (b.state && b.state === state ? 2 : 0);
      return scoreB - scoreA;
    });

    return rules;
  } catch (err) {
    console.warn('[RuleService] Appwrite query failed, falling back to local:', err.message);
    return _getLocalRulesSQLite({ country, state, city, category });
  }
}

/**
 * Find the single best-matching local rule for a waste category.
 */
async function findMatchingLocalRule({ country, state, city, category }) {
  if (!country || !category) return null;

  const rules = await getLocalRules({ country, state, city, category });
  return rules.length > 0 ? rules[0] : null;
}

/**
 * Get list of distinct countries in the rules database.
 */
async function getCountries() {
  if (!USE_APPWRITE) {
    return _getCountriesSQLite();
  }

  try {
    const db = getDatabases();
    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.local_rules, [
      sdk.Query.limit(100),
      sdk.Query.select(['country']),
    ]);

    const countries = Array.from(new Set(res.documents.map(d => d.country).filter(Boolean)));
    return countries.sort();
  } catch {
    return _getCountriesSQLite();
  }
}

/**
 * Get distinct states for a given country.
 */
async function getStates(country) {
  if (!USE_APPWRITE) {
    return _getStatesSQLite(country);
  }

  try {
    const db = getDatabases();
    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.local_rules, [
      sdk.Query.equal('country', country),
      sdk.Query.limit(100),
      sdk.Query.select(['state']),
    ]);

    const states = Array.from(new Set(res.documents.map(d => d.state).filter(Boolean)));
    return states.sort();
  } catch {
    return _getStatesSQLite(country);
  }
}

/**
 * Get distinct cities for a country and optional state.
 */
async function getCities(country, state) {
  if (!USE_APPWRITE) {
    return _getCitiesSQLite(country, state);
  }

  try {
    const db = getDatabases();
    const queries = [sdk.Query.equal('country', country), sdk.Query.limit(100), sdk.Query.select(['city', 'state'])];

    const res = await db.listDocuments(DATABASE_ID, COLLECTIONS.local_rules, queries);
    let docs = res.documents;
    if (state) {
      docs = docs.filter(d => !d.state || d.state === state);
    }

    const cities = Array.from(new Set(docs.map(d => d.city).filter(Boolean)));
    return cities.sort();
  } catch {
    return _getCitiesSQLite(country, state);
  }
}

function _normalizeRule(doc) {
  return {
    id: doc.$id || doc.id,
    country: doc.country,
    state: doc.state || '',
    city: doc.city || '',
    category: doc.category,
    bin_label: doc.bin_label,
    bin_color: doc.bin_color || 'grey',
    collection_schedule: doc.collection_schedule || '',
    special_instructions: doc.special_instructions || '',
    accepted_items: typeof doc.accepted_items === 'string' ? doc.accepted_items : JSON.stringify(doc.accepted_items || []),
    rejected_items: typeof doc.rejected_items === 'string' ? doc.rejected_items : JSON.stringify(doc.rejected_items || []),
    notes: doc.notes || '',
    data_source: doc.data_source || 'sample_data',
    verified: doc.verified === true || doc.verified === 1,
  };
}

// ─── SQLite Fallbacks ─────────────────────────────────────────────────────────

function _getLocalRulesSQLite({ country, state, city, category }) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    let query = 'SELECT * FROM local_rules WHERE country = ?';
    const params = [country];

    if (state) { query += ' AND (state = ? OR state = "")'; params.push(state); }
    if (city) { query += ' AND (city = ? OR city = "")'; params.push(city); }
    if (category) { query += ' AND category = ?'; params.push(category); }

    query += ' ORDER BY CASE WHEN city != "" THEN 3 WHEN state != "" THEN 2 ELSE 1 END DESC';

    return db.prepare(query).all(...params);
  } catch {
    return [];
  }
}

function _getCountriesSQLite() {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT DISTINCT country FROM local_rules ORDER BY country').all().map(r => r.country);
  } catch {
    return ['India'];
  }
}

function _getStatesSQLite(country) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT DISTINCT state FROM local_rules WHERE country = ? AND state != "" ORDER BY state').all(country).map(r => r.state);
  } catch {
    return [];
  }
}

function _getCitiesSQLite(country, state) {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    return db.prepare('SELECT DISTINCT city FROM local_rules WHERE country = ? AND (state = ? OR state = "") AND city != "" ORDER BY city')
      .all(country, state || '').map(r => r.city);
  } catch {
    return [];
  }
}

module.exports = {
  getLocalRules,
  findMatchingLocalRule,
  getCountries,
  getStates,
  getCities,
};
