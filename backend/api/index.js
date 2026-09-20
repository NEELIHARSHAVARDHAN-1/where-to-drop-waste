/**
 * Vercel Serverless Entry Point for the Express Backend.
 *
 * Exports the Express app as a serverless handler.
 * Vercel routes incoming requests via vercel.json.
 *
 * Important:
 *   - No app.listen() — Vercel manages the serverless process lifecycle.
 *   - Uses Appwrite for persistent cloud database, storage, and authentication.
 *   - Local SQLite is only initialized if Appwrite is not configured (local/preview fallback).
 */

'use strict';

const app = require('../src/app');
const { USE_APPWRITE } = require('../src/config/appwrite');

let _dbInitialized = false;

async function ensureFallbackDb() {
  if (_dbInitialized || USE_APPWRITE) return;
  try {
    const { initializeDatabase } = require('../src/database/db');
    await initializeDatabase();
    _dbInitialized = true;
  } catch (err) {
    console.warn('[Vercel Serverless] Fallback DB init notice:', err.message);
  }
}

module.exports = async (req, res) => {
  await ensureFallbackDb();
  return app(req, res);
};
