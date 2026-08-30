const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

// GET /api/leaderboard?limit=10
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const users = db.prepare(`
    SELECT id, name, points, level, recycling_score, streak_days
    FROM users ORDER BY points DESC LIMIT ?
  `).all(limit);

  // Add rank in JavaScript (avoids ROW_NUMBER window function compatibility issues)
  const ranked = users.map((u, i) => ({ ...u, rank: i + 1 }));

  res.json(ranked);
});

module.exports = router;
