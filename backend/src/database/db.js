/**
 * Database layer using sql.js (pure JavaScript SQLite — no native compilation)
 * Provides a synchronous API compatible with the rest of the codebase.
 * 
 * sql.js loads the entire DB into memory and saves to disk on each write.
 * For production use with larger datasets, migrate to better-sqlite3 or a proper RDBMS.
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/waste_app.db');

let SQL = null;
let db = null;
let _dirtyCount = 0;
const SAVE_INTERVAL = 10; // save every N writes

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loadSQL() {
  if (SQL) return SQL;
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  return SQL;
}

function saveDb() {
  if (!db) return;
  try {
    ensureDataDir();
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    // Ignore write errors in test environments
  }
}

function markDirty() {
  _dirtyCount++;
  if (_dirtyCount >= SAVE_INTERVAL) {
    saveDb();
    _dirtyCount = 0;
  }
}

async function initializeDatabase() {
  ensureDataDir();
  const SQLLib = await loadSQL();

  // Reset for test isolation
  if (db) {
    try { db.close(); } catch (e) { /* ignore */ }
    db = null;
  }

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQLLib.Database(fileBuffer);
  } else {
    db = new SQLLib.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  createTables();
  saveDb();

  const seed = require('./seed');
  seed.seedDatabase(getDb());
  saveDb();

  return getDb();
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      location_country TEXT DEFAULT 'India',
      location_state TEXT DEFAULT '',
      location_city TEXT DEFAULT '',
      user_type TEXT DEFAULT 'household',
      points INTEGER DEFAULT 0,
      recycling_score REAL DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      last_activity_date TEXT,
      level INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waste_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      aliases TEXT DEFAULT '[]',
      category TEXT NOT NULL,
      recyclable TEXT NOT NULL,
      bin_color TEXT DEFAULT 'grey',
      bin_label TEXT DEFAULT 'General Waste',
      disposal_method TEXT NOT NULL,
      preparation_instructions TEXT DEFAULT '',
      sustainability_info TEXT DEFAULT '',
      estimated_weight_grams REAL DEFAULT 50,
      co2_factor REAL DEFAULT 0,
      water_factor REAL DEFAULT 0,
      energy_factor REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      input_text TEXT,
      image_path TEXT,
      method TEXT NOT NULL,
      matched_item_id TEXT,
      category TEXT NOT NULL,
      recyclable TEXT NOT NULL,
      disposal_method TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      user_confirmed INTEGER DEFAULT 0,
      user_correction TEXT,
      points_awarded INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS impacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      classification_id TEXT,
      waste_category TEXT NOT NULL,
      weight_grams REAL DEFAULT 50,
      co2_saved_grams REAL DEFAULT 0,
      water_saved_ml REAL DEFAULT 0,
      energy_saved_wh REAL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT '🏅',
      criteria_type TEXT NOT NULL,
      criteria_value INTEGER NOT NULL,
      points_reward INTEGER DEFAULT 50
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      challenge_type TEXT DEFAULT 'community',
      target_value INTEGER NOT NULL,
      target_unit TEXT DEFAULT 'items',
      points_reward INTEGER DEFAULT 100,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_by TEXT DEFAULT 'system',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_challenges (
      user_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS local_rules (
      id TEXT PRIMARY KEY,
      country TEXT NOT NULL,
      state TEXT DEFAULT '',
      city TEXT DEFAULT '',
      category TEXT NOT NULL,
      bin_label TEXT NOT NULL,
      bin_color TEXT DEFAULT 'grey',
      collection_schedule TEXT DEFAULT '',
      special_instructions TEXT DEFAULT '',
      accepted_items TEXT DEFAULT '[]',
      rejected_items TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      data_source TEXT DEFAULT 'sample_data',
      verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS eco_tips (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tip_type TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_corrections (
      id TEXT PRIMARY KEY,
      classification_id TEXT NOT NULL,
      user_id TEXT,
      original_category TEXT NOT NULL,
      corrected_category TEXT NOT NULL,
      corrected_item TEXT,
      notes TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS training_candidates (
      id TEXT PRIMARY KEY,
      classification_id TEXT,
      image_path TEXT NOT NULL,
      predicted_class TEXT,
      predicted_confidence REAL DEFAULT 0,
      corrected_class TEXT NOT NULL,
      waste_category TEXT,
      user_id TEXT,
      admin_reviewed INTEGER DEFAULT 0,
      admin_approved INTEGER DEFAULT 0,
      admin_notes TEXT DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      granted_by TEXT,
      granted_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Returns a db-like object with prepare() returning an object with
 * get(), all(), run() synchronous methods — compatible with better-sqlite3 API style.
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');

  return {
    prepare(sql) {
      return {
        run(...args) {
          const params = _flattenParams(args);
          db.run(sql, params);
          markDirty();
          saveDb();
          return this;
        },
        get(...args) {
          const params = _flattenParams(args);
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        },
        all(...args) {
          const params = _flattenParams(args);
          const results = [];
          const stmt = db.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        },
      };
    },
    exec(sql) {
      db.run(sql);
      saveDb();
    },
    close() {
      saveDb();
      db.close();
      db = null;
    },
    // For ROW_NUMBER() OVER() window functions — sql.js supports them
    _raw: db,
  };
}

function _flattenParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args.flat();
}

module.exports = { getDb, initializeDatabase, saveDb };
