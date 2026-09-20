const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { awardPoints } = require('../services/appwriteGamificationService');
const { USE_APPWRITE, getDatabases, DATABASE_ID, COLLECTIONS, sdk } = require('../config/appwrite');
const router = express.Router();

// GET /api/challenges — all active challenges
router.get('/', async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const today = new Date().toISOString().split('T')[0];
      const res2 = await db.listDocuments(DATABASE_ID, COLLECTIONS.challenges, [
        sdk.Query.equal('is_active', true),
        sdk.Query.greaterThanEqual('end_date', today),
        sdk.Query.orderDesc('$createdAt'),
        sdk.Query.limit(50),
      ]);

      const challenges = await Promise.all(res2.documents.map(async (c) => {
        let participant_count = 0;
        try {
          const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
            sdk.Query.equal('challenge_id', c.$id), sdk.Query.limit(1),
          ]);
          participant_count = ucRes.total;
        } catch { /* ignore */ }
        return { id: c.$id, ...c, participant_count };
      }));

      return res.json(challenges);
    }

    const { getDb } = require('../database/db');
    res.json(getDb().prepare(`
      SELECT *, 
        (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id) as participant_count
      FROM challenges c WHERE is_active = 1 AND end_date >= date('now')
      ORDER BY start_date DESC
    `).all());
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// GET /api/challenges/my (protected)
router.get('/my', authMiddleware, async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
        sdk.Query.equal('user_id', req.user.id),
        sdk.Query.orderDesc('joined_at'),
        sdk.Query.limit(50),
      ]);

      const challenges = await Promise.all(ucRes.documents.map(async (uc) => {
        try {
          const c = await db.getDocument(DATABASE_ID, COLLECTIONS.challenges, uc.challenge_id);
          return { id: c.$id, ...c, progress: uc.progress, completed: uc.completed,
            completed_at: uc.completed_at, joined_at: uc.joined_at };
        } catch { return null; }
      }));

      return res.json(challenges.filter(Boolean));
    }

    const { getDb } = require('../database/db');
    res.json(getDb().prepare(`
      SELECT c.*, uc.progress, uc.completed, uc.completed_at, uc.joined_at
      FROM user_challenges uc
      JOIN challenges c ON uc.challenge_id = c.id
      WHERE uc.user_id = ?
      ORDER BY uc.joined_at DESC
    `).all(req.user.id));
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch your challenges' });
  }
});

// POST /api/challenges/:id/join (protected)
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const challenge = await db.getDocument(DATABASE_ID, COLLECTIONS.challenges, req.params.id);
      if (!challenge || !challenge.is_active) return res.status(404).json({ error: 'Challenge not found or inactive' });

      // Check if already joined
      const existing = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
        sdk.Query.equal('user_id', req.user.id),
        sdk.Query.equal('challenge_id', req.params.id),
        sdk.Query.limit(1),
      ]);
      if (existing.total > 0) return res.status(409).json({ error: 'Already joined this challenge' });

      await db.createDocument(DATABASE_ID, COLLECTIONS.user_challenges, uuidv4(), {
        user_id:      req.user.id,
        challenge_id: req.params.id,
        progress:     0,
        completed:    false,
        completed_at: null,
        joined_at:    new Date().toISOString(),
      });

      return res.json({ success: true, challenge: { id: challenge.$id, ...challenge } });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found or inactive' });
    const existing = db.prepare('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?').get(req.user.id, challenge.id);
    if (existing) return res.status(409).json({ error: 'Already joined this challenge' });
    db.prepare('INSERT INTO user_challenges (user_id, challenge_id) VALUES (?, ?)').run(req.user.id, challenge.id);
    res.json({ success: true, challenge });
  } catch (e) {
    if (e.code === 404) return res.status(404).json({ error: 'Challenge not found' });
    res.status(500).json({ error: 'Failed to join challenge' });
  }
});

// GET /api/challenges/:id
router.get('/:id', async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const challenge = await db.getDocument(DATABASE_ID, COLLECTIONS.challenges, req.params.id);

      let participant_count = 0, completion_count = 0;
      try {
        const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
          sdk.Query.equal('challenge_id', req.params.id), sdk.Query.limit(1),
        ]);
        participant_count = ucRes.total;
        const compRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
          sdk.Query.equal('challenge_id', req.params.id),
          sdk.Query.equal('completed', true),
          sdk.Query.limit(1),
        ]);
        completion_count = compRes.total;
      } catch { /* ignore */ }

      return res.json({ id: challenge.$id, ...challenge, participant_count, completion_count });
    }

    const { getDb } = require('../database/db');
    const challenge = getDb().prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id) as participant_count,
        (SELECT COUNT(*) FROM user_challenges uc WHERE uc.challenge_id = c.id AND uc.completed = 1) as completion_count
      FROM challenges c WHERE c.id = ?
    `).get(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    res.json(challenge);
  } catch (e) {
    if (e.code === 404) return res.status(404).json({ error: 'Challenge not found' });
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

module.exports = router;
