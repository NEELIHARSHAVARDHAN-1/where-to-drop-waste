const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getUserStats, LEVELS } = require('../services/appwriteGamificationService');
const { getUserImpacts, getUserImpactByCategory } = require('../services/appwriteImpactService');
const { getCategoryBreakdown, getWeeklyActivity } = require('../services/classificationService');
const { USE_APPWRITE, getDatabases, DATABASE_ID, COLLECTIONS, sdk } = require('../config/appwrite');
const { aggregateImpacts } = require('../services/impactService');
const router = express.Router();

// GET /api/dashboard (protected)
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const userStats = await getUserStats(userId);
    if (!userStats) return res.status(404).json({ error: 'User not found' });

    // Recent classifications
    let recentClassifications = [];
    if (USE_APPWRITE) {
      const db = getDatabases();
      const cRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
        sdk.Query.equal('user_id', userId),
        sdk.Query.orderDesc('timestamp'),
        sdk.Query.limit(10),
      ]);
      recentClassifications = cRes.documents.map(d => ({
        id: d.$id, category: d.category, recyclable: d.recyclable,
        method: d.method, confidence: d.confidence, timestamp: d.timestamp,
        input_text: d.input_text,
      }));
    } else {
      const { getDb } = require('../database/db');
      recentClassifications = getDb().prepare(
        'SELECT * FROM classifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10'
      ).all(userId);
    }

    // Impact totals
    const impactRows = await getUserImpacts(userId);
    const totalImpact = aggregateImpacts(impactRows);

    // Category breakdown
    const categoryBreakdown = await getCategoryBreakdown(userId);

    // Active challenges
    let activeChallenges = [];
    if (USE_APPWRITE) {
      const db = getDatabases();
      const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
        sdk.Query.equal('user_id', userId),
        sdk.Query.equal('completed', false),
        sdk.Query.limit(3),
      ]);

      for (const uc of ucRes.documents) {
        try {
          const challenge = await db.getDocument(DATABASE_ID, COLLECTIONS.challenges, uc.challenge_id);
          if (challenge.end_date >= new Date().toISOString().split('T')[0]) {
            activeChallenges.push({
              challenge_id: uc.challenge_id,
              title: challenge.title,
              description: challenge.description,
              target_value: challenge.target_value,
              target_unit: challenge.target_unit,
              points_reward: challenge.points_reward,
              end_date: challenge.end_date,
              progress: uc.progress,
              completed: uc.completed,
            });
          }
        } catch { /* skip missing challenges */ }
      }
    } else {
      const { getDb } = require('../database/db');
      activeChallenges = getDb().prepare(`
        SELECT uc.*, c.title, c.description, c.target_value, c.target_unit, c.points_reward, c.end_date
        FROM user_challenges uc
        JOIN challenges c ON uc.challenge_id = c.id
        WHERE uc.user_id = ? AND uc.completed = 0 AND c.end_date >= date('now')
        LIMIT 3
      `).all(userId);
    }

    // Weekly activity
    const weeklyActivity = await getWeeklyActivity(userId);

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
  } catch (e) {
    console.error('[Dashboard] error:', e.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
