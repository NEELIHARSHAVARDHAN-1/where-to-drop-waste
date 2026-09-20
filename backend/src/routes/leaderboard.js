const express = require('express');
const { getLeaderboard } = require('../services/profileService');
const router = express.Router();

// GET /api/leaderboard?limit=10
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const ranked = await getLeaderboard(limit);
    res.json(ranked);
  } catch (err) {
    console.error('[Leaderboard] Error fetching leaderboard:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;
