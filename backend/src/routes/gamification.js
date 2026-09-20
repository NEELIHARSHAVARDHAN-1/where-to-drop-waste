const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getUserStats, LEVELS } = require('../services/appwriteGamificationService');
const { USE_APPWRITE, getDatabases, DATABASE_ID, COLLECTIONS, sdk } = require('../config/appwrite');
const router = express.Router();

// GET /api/gamification/profile (protected)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const stats = await getUserStats(req.user.id);
    if (!stats) return res.status(404).json({ error: 'User not found' });
    res.json({ ...stats, levels: LEVELS });
  } catch (e) {
    console.error('[Gamification] profile error:', e.message);
    res.status(500).json({ error: 'Failed to fetch gamification profile' });
  }
});

// GET /api/gamification/badges/all — all available badges
router.get('/badges/all', async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const res2 = await db.listDocuments(DATABASE_ID, COLLECTIONS.badges, [
        sdk.Query.orderAsc('criteria_value'),
        sdk.Query.limit(100),
      ]);
      return res.json(res2.documents.map(b => ({
        id: b.$id, name: b.name, description: b.description,
        icon: b.icon, criteria_type: b.criteria_type,
        criteria_value: b.criteria_value, points_reward: b.points_reward,
      })));
    }

    const { getDb } = require('../database/db');
    res.json(getDb().prepare('SELECT * FROM badges ORDER BY criteria_value ASC').all());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
});

// GET /api/gamification/badges (protected) — user's earned badges
router.get('/badges', authMiddleware, async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const ubRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_badges, [
        sdk.Query.equal('user_id', req.user.id),
        sdk.Query.orderDesc('earned_at'),
        sdk.Query.limit(50),
      ]);

      const badgeIds = ubRes.documents.map(d => d.badge_id);
      if (badgeIds.length === 0) return res.json([]);

      const bRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.badges, [
        sdk.Query.equal('$id', badgeIds),
        sdk.Query.limit(50),
      ]);

      const earned = bRes.documents.map(b => ({
        id:          b.$id,
        name:        b.name,
        description: b.description,
        icon:        b.icon,
        earned_at:   ubRes.documents.find(u => u.badge_id === b.$id)?.earned_at,
      }));
      return res.json(earned);
    }

    const { getDb } = require('../database/db');
    const earned = getDb().prepare(`
      SELECT b.*, ub.earned_at FROM badges b 
      JOIN user_badges ub ON b.id = ub.badge_id 
      WHERE ub.user_id = ? ORDER BY ub.earned_at DESC
    `).all(req.user.id);
    res.json(earned);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user badges' });
  }
});

module.exports = router;
