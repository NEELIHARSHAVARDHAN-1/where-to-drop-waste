const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getUserImpacts, getUserImpactByCategory } = require('../services/appwriteImpactService');
const { aggregateImpacts } = require('../services/impactService');
const router = express.Router();

// GET /api/impact (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const impacts = await getUserImpacts(req.user.id);
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
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch impact data' });
  }
});

// GET /api/impact/by-category (protected)
router.get('/by-category', authMiddleware, async (req, res) => {
  try {
    const breakdown = await getUserImpactByCategory(req.user.id);
    res.json(breakdown);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch impact breakdown' });
  }
});

module.exports = router;
