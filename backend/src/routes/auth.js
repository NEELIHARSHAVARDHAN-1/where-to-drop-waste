/**
 * Auth Routes — Appwrite + SQLite fallback
 *
 * Appwrite mode:
 *   - Registration: Creates Appwrite user, creates profile document.
 *   - Login: Returns a session JWT for the frontend to use.
 *   - Token verification: via Appwrite JWT (account.get())
 *
 * SQLite fallback mode (when Appwrite is not configured):
 *   - Legacy bcrypt + JWT flow is preserved for local development.
 *
 * SECURITY:
 *   - Passwords are NEVER stored manually in Appwrite mode.
 *   - User identity is always derived from the verified token.
 *   - req.body.user_id is never trusted.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { USE_APPWRITE, sdk, getClient } = require('../config/appwrite');
const { authMiddleware } = require('../middleware/auth');
const { getProfile, createProfile, updateProfile } = require('../services/profileService');
const { awardPoints, updateStreak } = require('../services/appwriteGamificationService');

const router = express.Router();

// ─── Appwrite registration helper ─────────────────────────────────────────────

async function registerWithAppwrite(name, email, password, profileData) {
  const endpoint   = process.env.APPWRITE_ENDPOINT   || 'https://cloud.appwrite.io/v1';
  const projectId  = process.env.APPWRITE_PROJECT_ID;
  const apiKey     = process.env.APPWRITE_API_KEY;

  // Create user in Appwrite Auth
  const client = new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  const users = new sdk.Users(client);
  const userId = sdk.ID.unique();

  // Create user account
  await users.create(userId, email, undefined, password, name);

  // Create profile document in database
  await createProfile(userId, {
    name,
    email,
    location_country: profileData.location_country || 'India',
    location_state:   profileData.location_state   || '',
    location_city:    profileData.location_city    || '',
    user_type:        profileData.user_type        || 'household',
  });

  return { userId, email, name };
}

/**
 * Create a session for the user and return the JWT token.
 * Uses the Appwrite session API server-side.
 */
async function createSessionToken(email, password) {
  const endpoint   = process.env.APPWRITE_ENDPOINT   || 'https://cloud.appwrite.io/v1';
  const projectId  = process.env.APPWRITE_PROJECT_ID;

  // Create a session-scoped client (anonymous to start)
  const client = new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId);

  const account = new sdk.Account(client);

  // Create email session
  const session = await account.createEmailPasswordSession(email, password);
  return session;
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 100 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('location_country').optional().trim().escape(),
  body('location_state').optional().trim().escape(),
  body('location_city').optional().trim().escape(),
  body('user_type').optional().isIn(['household', 'school', 'office', 'community']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, location_country, location_state, location_city, user_type } = req.body;

  if (USE_APPWRITE) {
    try {
      await registerWithAppwrite(name, email, password, {
        location_country: location_country || 'India',
        location_state:   location_state   || '',
        location_city:    location_city    || '',
        user_type:        user_type        || 'household',
      });

      // Create a session to return a token
      const session = await createSessionToken(email, password);

      // Award first login points (best-effort)
      try {
        await awardPoints(session.userId, 'DAILY_LOGIN');
      } catch { /* ignore */ }

      const profile = await getProfile(session.userId);

      return res.status(201).json({
        token: session.secret, // Appwrite session secret = JWT
        user: {
          id:               session.userId,
          email,
          name,
          location_country: profile?.location_country || location_country || 'India',
          location_state:   profile?.location_state   || location_state   || '',
          location_city:    profile?.location_city    || location_city    || '',
          user_type:        profile?.user_type        || user_type        || 'household',
          points:           0,
          level:            1,
          recycling_score:  0,
        },
      });
    } catch (err) {
      if (err.code === 409 || err.message?.includes('already exists') || err.message?.includes('conflict')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('[Auth] Registration error:', err.message);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }

  // ── SQLite fallback ──────────────────────────────────────────────────────
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const { getDb } = require('../database/db');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, location_country, location_state, location_city, user_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email, password_hash, location_country || 'India', location_state || '', location_city || '', user_type || 'household');

  awardPoints(id, 'DAILY_LOGIN');

  const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '7d' });
  const user = db.prepare('SELECT id, name, email, location_country, location_state, location_city, user_type, points, level, recycling_score FROM users WHERE id = ?').get(id);

  return res.status(201).json({ token, user });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  if (USE_APPWRITE) {
    try {
      const session = await createSessionToken(email, password);

      // Best-effort streak + points
      try {
        await updateStreak(session.userId);
        await awardPoints(session.userId, 'DAILY_LOGIN');
      } catch { /* ignore */ }

      const profile = await getProfile(session.userId);

      return res.json({
        token: session.secret,
        user: {
          id:               session.userId,
          email,
          name:             profile?.name || email.split('@')[0],
          location_country: profile?.location_country || 'India',
          location_state:   profile?.location_state   || '',
          location_city:    profile?.location_city    || '',
          user_type:        profile?.user_type        || 'household',
          points:           profile?.points           || 0,
          level:            profile?.level            || 1,
          recycling_score:  profile?.recycling_score  || 0,
          streak_days:      profile?.streak_days      || 0,
        },
      });
    } catch (err) {
      if (err.code === 401 || err.message?.includes('Invalid credentials') || err.message?.includes('password')) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      console.error('[Auth] Login error:', err.message);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
  }

  // ── SQLite fallback ──────────────────────────────────────────────────────
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const { getDb } = require('../database/db');
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  updateStreak(user.id);
  awardPoints(user.id, 'DAILY_LOGIN');

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;
  return res.json({ token, user: safeUser });
});

// ─── GET /api/auth/me (protected) ────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const profile = await getProfile(req.user.id);
      if (!profile) return res.status(404).json({ error: 'User not found' });
      return res.json({
        id:               req.user.id,
        email:            req.user.email,
        name:             profile.name || req.user.name,
        location_country: profile.location_country,
        location_state:   profile.location_state,
        location_city:    profile.location_city,
        user_type:        profile.user_type,
        points:           profile.points,
        level:            profile.level,
        recycling_score:  profile.recycling_score,
        streak_days:      profile.streak_days,
        created_at:       profile.created_at,
      });
    }

    // SQLite fallback
    const { getDb } = require('../database/db');
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, location_country, location_state, location_city, user_type, points, level, recycling_score, streak_days, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    console.error('[Auth] /me error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// ─── PATCH /api/auth/profile (protected) ─────────────────────────────────────
router.patch('/profile', authMiddleware, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).escape(),
  body('location_country').optional().trim().escape(),
  body('location_state').optional().trim().escape(),
  body('location_city').optional().trim().escape(),
  body('user_type').optional().isIn(['household', 'school', 'office', 'community']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const allowed = ['name', 'location_country', 'location_state', 'location_city', 'user_type'];
  const updates = {};
  for (const f of allowed) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    const profile = await updateProfile(req.user.id, updates);
    return res.json(profile);
  } catch (err) {
    console.error('[Auth] Profile update error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// For Appwrite, session invalidation happens client-side via the Web SDK.
// This endpoint is provided for completeness / HTTP-only cookie flows.
router.post('/logout', authMiddleware, async (req, res) => {
  // No server-side state to clear for stateless tokens.
  return res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
