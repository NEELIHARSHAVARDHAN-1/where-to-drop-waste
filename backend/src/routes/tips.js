const express = require('express');
const { getTips, getDailyTip } = require('../services/tipService');
const router = express.Router();

// GET /api/tips?type=eco_fact&count=1
router.get('/', async (req, res) => {
  const { type, category, count } = req.query;

  try {
    const tips = await getTips({ type, category, count });
    res.json(tips);
  } catch (err) {
    console.error('[Tips] Error fetching tips:', err.message);
    res.status(500).json({ error: 'Failed to fetch tips' });
  }
});

// GET /api/tips/daily — one random daily tip
router.get('/daily', async (req, res) => {
  try {
    const tip = await getDailyTip();
    res.json(tip || null);
  } catch (err) {
    console.error('[Tips] Error fetching daily tip:', err.message);
    res.status(500).json({ error: 'Failed to fetch daily tip' });
  }
});

module.exports = router;
