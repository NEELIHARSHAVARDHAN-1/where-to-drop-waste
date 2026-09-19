const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { awardPoints, updateStreak } = require('../services/gamificationService');
const { verifyToken } = require('../services/supabaseClient');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Dual-mode auth middleware.
 * - With Supabase: verifies access_token via supabase.auth.getUser()
 * - Without Supabase: verifies legacy JWT via jsonwebtoken
 * Sets req.user = { id, email, name }
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Authorization header required' });
  const token = header.replace('Bearer ', '');
  try {
    if (USE_SUPABASE) {
      const supabaseUser = await verifyToken(token);
      req.user = { id: supabaseUser.id, email: supabaseUser.email, name: supabaseUser.user_metadata?.name };
    } else {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// POST /api/auth/register
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
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, location_country, location_state, location_city, user_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email, password_hash, location_country || 'India', location_state || '', location_city || '', user_type || 'household');

  // Award first login points
  awardPoints(id, 'DAILY_LOGIN');

  const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '7d' });
  const user = db.prepare('SELECT id, name, email, location_country, location_state, location_city, user_type, points, level, recycling_score FROM users WHERE id = ?').get(id);

  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  updateStreak(user.id);
  awardPoints(user.id, 'DAILY_LOGIN');

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safeUser } = user;

  res.json({ token, user: safeUser });
});

// GET /api/auth/me (protected)
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, location_country, location_state, location_city, user_type, points, level, recycling_score, streak_days, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PATCH /api/auth/profile (protected)
router.patch('/profile', authMiddleware, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).escape(),
  body('location_country').optional().trim().escape(),
  body('location_state').optional().trim().escape(),
  body('location_city').optional().trim().escape(),
  body('user_type').optional().isIn(['household', 'school', 'office', 'community']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const db = getDb();
  const fields = ['name', 'location_country', 'location_state', 'location_city', 'user_type'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...Object.values(updates), req.user.id);

  const user = db.prepare('SELECT id, name, email, location_country, location_state, location_city, user_type, points, level, recycling_score FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
