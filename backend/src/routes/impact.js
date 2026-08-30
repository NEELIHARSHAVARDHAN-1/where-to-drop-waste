const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('./auth');
const { aggregateImpacts } = require('../services/impactService');
const router = express.Router();

// GET /api/impact (protected) — user's full impact history
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const impacts = db.prepare('SELECT * FROM impacts WHERE user_id = ? ORDER BY timestamp DESC').all(req.user.id);
  const summary = aggregateImpacts(impacts);

  res.json({
    summary: {
      ...summary,
      co2_kg: (summary.total_co2_saved_grams / 1000).toFixed(3),
      water_liters: (summary.total_water_saved_ml / 1000).toFixed(2),
      energy_kwh: (summary.total_energy_saved_wh / 1000).toFixed(3),
    },
    history: impacts,
    disclaimer: 'These are estimated values based on industry averages. Actual environmental impact depends on local recycling infrastructure and processing methods.',
  });
});

// GET /api/impact/by-category (protected)
router.get('/by-category', authMiddleware, (req, res) => {
  const db = getDb();
  const breakdown = db.prepare(`
    SELECT waste_category, 
      COUNT(*) as item_count,
      SUM(co2_saved_grams) as co2_grams,
      SUM(water_saved_ml) as water_ml,
      SUM(energy_saved_wh) as energy_wh
    FROM impacts WHERE user_id = ? 
    GROUP BY waste_category ORDER BY co2_grams DESC
  `).all(req.user.id);
  res.json(breakdown);
});

module.exports = router;
