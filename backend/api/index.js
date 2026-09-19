/**
 * Vercel serverless entry point for the backend.
 *
 * Exports the Express app as a serverless handler.
 * Vercel wraps this and handles routing via vercel.json.
 *
 * Important:
 *   - No app.listen() here — Vercel manages the server lifecycle.
 *   - The database is initialized on first invocation.
 *   - sql.js in-memory DB is ephemeral on serverless; use Supabase for production.
 */

'use strict';

const { initializeDatabase } = require('./src/database/db');

// Initialize database once (module-level — reused across invocations in the same container)
let _dbInitialized = false;
async function ensureDb() {
  if (_dbInitialized) return;
  await initializeDatabase();
  _dbInitialized = true;
}

const app = require('./src/app');

module.exports = async (req, res) => {
  await ensureDb();
  app(req, res);
};
