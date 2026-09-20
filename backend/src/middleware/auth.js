/**
 * Authentication Middleware
 *
 * Dual-mode: Appwrite (production) or local JWT (development/test fallback).
 *
 * Appwrite mode:
 *   - Creates a session-scoped Appwrite client from the Bearer token.
 *   - Calls account.get() to verify the token and get the user identity.
 *   - Sets req.user = { id, email, name }
 *
 * JWT fallback mode (when Appwrite is not configured):
 *   - Verifies the legacy JWT signed with JWT_SECRET.
 *   - Sets req.user = { id, email, name }
 *
 * SECURITY: user identity is ALWAYS derived from the verified token.
 *           req.body.user_id is NEVER trusted.
 */

'use strict';

const sdk = require('node-appwrite');
const { USE_APPWRITE, COLLECTIONS, DATABASE_ID, getDatabases } = require('../config/appwrite');

const ENDPOINT   = process.env.APPWRITE_ENDPOINT   || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

/**
 * Verify an Appwrite session JWT and return the authenticated user.
 * Creates a short-lived client scoped to the user's session.
 */
async function verifyAppwriteToken(token) {
  const client = new sdk.Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setJWT(token);

  const account = new sdk.Account(client);
  const user = await account.get();
  return user; // { $id, email, name, ... }
}

/**
 * Main auth middleware.
 * Sets req.user = { id, email, name } or returns 401.
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = header.slice(7); // remove 'Bearer '

  try {
    if (USE_APPWRITE) {
      const appwriteUser = await verifyAppwriteToken(token);
      req.user = {
        id:    appwriteUser.$id,
        email: appwriteUser.email,
        name:  appwriteUser.name || appwriteUser.email?.split('@')[0],
      };
    } else {
      // Local JWT fallback
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    }
    next();
  } catch (err) {
    // Don't leak details
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional auth: tries to identify user, but allows anonymous access.
 * Sets req.user if token is present and valid, otherwise req.user = null.
 */
async function optionalAuthMiddleware(req, res, next) {
  if (!req.headers.authorization) {
    req.user = null;
    return next();
  }
  try {
    await authMiddleware(req, res, next);
  } catch {
    req.user = null;
    next();
  }
}

module.exports = { authMiddleware, optionalAuthMiddleware, verifyAppwriteToken };
