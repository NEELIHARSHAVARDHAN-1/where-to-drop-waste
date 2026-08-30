const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/db');
const { authMiddleware } = require('./auth');
const { awardPoints } = require('../services/gamificationService');
const router = express.Router();

// GET /api/challenges — all active challenges
router.get('/', (req, res) => {
  const db = getDb();
  const challenges = db.prepare(`
    SELECT *, 
      (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id) as participant_count
    FROM challenges c WHERE is_active = 1 AND end_date >= date('now')
    ORDER BY start_date DESC
  `).all();
  res.json(challenges);
});

// GET /api/challenges/my (protected) — challenges joined by user
router.get('/my', authMiddleware, (req, res) => {
  const db = getDb();
  const challenges = db.prepare(`
    SELECT c.*, uc.progress, uc.completed, uc.completed_at, uc.joined_at
    FROM user_challenges uc
    JOIN challenges c ON uc.challenge_id = c.id
    WHERE uc.user_id = ?
    ORDER BY uc.joined_at DESC
  `).all(req.user.id);
  res.json(challenges);
});

// POST /api/challenges/:id/join (protected)
router.post('/:id/join', authMiddleware, (req, res) => {
  const db = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found or inactive' });

  const existing = db.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?').get(req.user.id, challenge.id);
  if (existing) return res.status(409).json({ error: 'Already joined this challenge' });

  db.prepare('INSERT INTO user_challenges (user_id, challenge_id) VALUES (?, ?)').run(req.user.id, challenge.id);
  res.json({ success: true, challenge });
});

// GET /api/challenges/:id — single challenge with user progress
router.get('/:id', (req, res) => {
  const db = getDb();
  const challenge = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id) as participant_count,
      (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id AND uc.completed = 1) as completion_count
    FROM challenges c WHERE c.id = ?
  `).get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
  res.json(challenge);
});

module.exports = router;
