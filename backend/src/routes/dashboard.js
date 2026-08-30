const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('./auth');
const { getUserStats } = require('../services/gamificationService');
const { aggregateImpacts } = require('../services/impactService');
const router = express.Router();

// GET /api/dashboard (protected)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const userStats = getUserStats(userId);
  if (!userStats) return res.status(404).json({ error: 'User not found' });

  const recentClassifications = db.prepare(`
    SELECT * FROM classifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10
  `).all(userId);

  const impactRows = db.prepare('SELECT * FROM impacts WHERE user_id = ?').all(userId);
  const totalImpact = aggregateImpacts(impactRows);

  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as count FROM classifications WHERE user_id = ? GROUP BY category ORDER BY count DESC
  `).all(userId);

  const activeChallenges = db.prepare(`
    SELECT uc.*, c.title, c.description, c.target_value, c.target_unit, c.points_reward, c.end_date
    FROM user_challenges uc
    JOIN challenges c ON uc.challenge_id = c.id
    WHERE uc.user_id = ? AND uc.completed = 0 AND c.end_date >= date('now')
    LIMIT 3
  `).all(userId);

  const weeklyActivity = db.prepare(`
    SELECT date(timestamp) as day, COUNT(*) as count 
    FROM classifications WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')
    GROUP BY date(timestamp) ORDER BY day ASC
  `).all(userId);

  res.json({
    user: userStats,
    impact: {
      ...totalImpact,
      co2_kg: (totalImpact.total_co2_saved_grams / 1000).toFixed(2),
      water_liters: (totalImpact.total_water_saved_ml / 1000).toFixed(2),
      energy_kwh: (totalImpact.total_energy_saved_wh / 1000).toFixed(2),
      items_diverted: totalImpact.total_items,
    },
    recent_classifications: recentClassifications,
    category_breakdown: categoryBreakdown,
    active_challenges: activeChallenges,
    weekly_activity: weeklyActivity,
    disclaimer: 'Environmental impact values are estimates based on industry averages.',
  });
});

module.exports = router;
