const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('./auth');
const { getUserStats, LEVELS } = require('../services/gamificationService');
const router = express.Router();

// GET /api/gamification/profile (protected)
router.get('/profile', authMiddleware, (req, res) => {
  const stats = getUserStats(req.user.id);
  if (!stats) return res.status(404).json({ error: 'User not found' });
  res.json({ ...stats, levels: LEVELS });
});

// GET /api/gamification/badges/all — all available badges
router.get('/badges/all', (req, res) => {
  const db = getDb();
  const badges = db.prepare('SELECT * FROM badges ORDER BY criteria_value ASC').all();
  res.json(badges);
});

// GET /api/gamification/badges (protected) — user's earned badges
router.get('/badges', authMiddleware, (req, res) => {
  const db = getDb();
  const earned = db.prepare(`
    SELECT b.*, ub.earned_at FROM badges b 
    JOIN user_badges ub ON b.id = ub.badge_id 
    WHERE ub.user_id = ? ORDER BY ub.earned_at DESC
  `).all(req.user.id);
  res.json(earned);
});

module.exports = router;
