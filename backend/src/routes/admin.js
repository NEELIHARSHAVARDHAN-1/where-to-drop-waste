/**
 * Admin Routes
 *
 * Provides admin-only endpoints for:
 *   - Viewing training candidates (unrecognized/corrected images)
 *   - Reviewing and approving/rejecting training candidates
 *   - Viewing user corrections
 *   - Model status
 *   - Global stats
 *   - Exporting approved dataset
 *
 * Supports Appwrite Database with local SQLite fallback.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { getModelStatus } = require('../services/vision/tensorflowLiteService');
const { USE_APPWRITE, getDatabases, DATABASE_ID, COLLECTIONS, sdk } = require('../config/appwrite');

const router = express.Router();

// ─── Admin check middleware ───────────────────────────────────────────────────
async function adminMiddleware(req, res, next) {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const resDocs = await db.listDocuments(DATABASE_ID, COLLECTIONS.admin_users, [
        sdk.Query.equal('user_id', req.user.id),
        sdk.Query.limit(1),
      ]);
      if (resDocs.total === 0) return res.status(403).json({ error: 'Admin access required' });
      return next();
    }

    const { getDb } = require('../database/db');
    const admin = getDb().prepare('SELECT id FROM admin_users WHERE user_id = ?').get(req.user.id);
    if (!admin) return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (err) {
    res.status(403).json({ error: 'Admin access required' });
  }
}

// All admin routes require authentication
router.use(authMiddleware);

// ─── POST /api/admin/grant ────────────────────────────────────────────────────
// Grant admin to first user (bootstrap). Only works when admin_users is empty.
router.post('/grant', [
  body('user_id').optional().trim(),
], async (req, res) => {
  const targetUserId = req.body.user_id || req.user.id;

  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const existing = await db.listDocuments(DATABASE_ID, COLLECTIONS.admin_users, [sdk.Query.limit(1)]);
      if (existing.total > 0) {
        return res.status(403).json({ error: 'Admin already exists. Contact an existing admin to grant access.' });
      }

      await db.createDocument(DATABASE_ID, COLLECTIONS.admin_users, uuidv4(), {
        user_id: targetUserId,
        granted_by: req.user.id,
        granted_at: new Date().toISOString(),
      });
      return res.json({ success: true, message: `Admin granted to user ${targetUserId}` });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    const existing = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
    if (existing && existing.count > 0) {
      return res.status(403).json({ error: 'Admin already exists. Contact an existing admin to grant access.' });
    }

    db.prepare('INSERT OR IGNORE INTO admin_users (id, user_id, granted_by) VALUES (?, ?, ?)')
      .run(uuidv4(), targetUserId, req.user.id);
    res.json({ success: true, message: `Admin granted to user ${targetUserId}` });
  } catch (err) {
    console.error('[Admin] Grant error:', err.message);
    res.status(500).json({ error: 'Failed to grant admin access' });
  }
});

// All subsequent routes require admin
router.use(adminMiddleware);

// ─── GET /api/admin/training-candidates ──────────────────────────────────────
router.get('/training-candidates', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status; // 'pending' | 'approved' | 'rejected'

  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const queries = [sdk.Query.orderDesc('timestamp'), sdk.Query.limit(limit), sdk.Query.offset(offset)];

      if (status === 'pending') {
        queries.push(sdk.Query.equal('admin_reviewed', 0));
      } else if (status === 'approved') {
        queries.push(sdk.Query.equal('admin_reviewed', 1));
        queries.push(sdk.Query.equal('admin_approved', 1));
      } else if (status === 'rejected') {
        queries.push(sdk.Query.equal('admin_reviewed', 1));
        queries.push(sdk.Query.equal('admin_approved', 0));
      }

      const resList = await db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, queries);

      // Stats counts
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [sdk.Query.equal('admin_reviewed', 0), sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [sdk.Query.equal('admin_reviewed', 1), sdk.Query.equal('admin_approved', 1), sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [sdk.Query.equal('admin_reviewed', 1), sdk.Query.equal('admin_approved', 0), sdk.Query.limit(1)]),
      ]);

      const items = resList.documents.map(d => ({
        id: d.$id,
        classification_id: d.classification_id,
        image_path: d.image_path,
        predicted_class: d.predicted_class,
        predicted_confidence: d.predicted_confidence,
        corrected_class: d.corrected_class,
        waste_category: d.waste_category,
        user_id: d.user_id,
        admin_reviewed: d.admin_reviewed,
        admin_approved: d.admin_approved,
        admin_notes: d.admin_notes,
        reviewed_by: d.reviewed_by,
        reviewed_at: d.reviewed_at,
        timestamp: d.timestamp,
      }));

      return res.json({
        items,
        total: resList.total,
        page,
        limit,
        pages: Math.ceil(resList.total / limit),
        stats: {
          pending: pendingRes.total,
          approved: approvedRes.total,
          rejected: rejectedRes.total,
        },
      });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    let where = '';
    if (status === 'pending') where = 'WHERE tc.admin_reviewed = 0';
    else if (status === 'approved') where = 'WHERE tc.admin_reviewed = 1 AND tc.admin_approved = 1';
    else if (status === 'rejected') where = 'WHERE tc.admin_reviewed = 1 AND tc.admin_approved = 0';

    const items = db.prepare(`
      SELECT tc.*, u.name as user_name, u.email as user_email
      FROM training_candidates tc
      LEFT JOIN users u ON tc.user_id = u.id
      ${where}
      ORDER BY tc.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM training_candidates tc ${where}`).get();
    const total = totalRow ? totalRow.count : 0;

    const stats = {
      pending: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 0').get()?.count || 0,
      approved: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 1 AND admin_approved = 1').get()?.count || 0,
      rejected: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 1 AND admin_approved = 0').get()?.count || 0,
    };

    res.json({ items, total, page, limit, pages: Math.ceil(total / limit), stats });
  } catch (err) {
    console.error('[Admin] Training candidates error:', err.message);
    res.status(500).json({ error: 'Failed to fetch training candidates' });
  }
});

// ─── POST /api/admin/training-candidates/:id/review ──────────────────────────
router.post('/training-candidates/:id/review', [
  body('approved').isBoolean(),
  body('notes').optional().trim().escape(),
  body('corrected_class').optional().trim().escape(),
  body('waste_category').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id } = req.params;
  const { approved, notes, corrected_class, waste_category } = req.body;

  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const updates = {
        admin_reviewed: 1,
        admin_approved: approved ? 1 : 0,
        admin_notes: notes || '',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
      };
      if (corrected_class) updates.corrected_class = corrected_class;
      if (waste_category) updates.waste_category = waste_category;

      await db.updateDocument(DATABASE_ID, COLLECTIONS.training_candidates, id, updates);

      return res.json({
        success: true,
        message: approved ? 'Training candidate approved for dataset.' : 'Training candidate rejected.',
        id,
      });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    const candidate = db.prepare('SELECT * FROM training_candidates WHERE id = ?').get(id);
    if (!candidate) return res.status(404).json({ error: 'Training candidate not found' });

    db.prepare(`
      UPDATE training_candidates
      SET admin_reviewed = 1,
          admin_approved = ?,
          admin_notes = ?,
          reviewed_by = ?,
          reviewed_at = datetime('now'),
          corrected_class = COALESCE(?, corrected_class),
          waste_category = COALESCE(?, waste_category)
      WHERE id = ?
    `).run(
      approved ? 1 : 0,
      notes || '',
      req.user.id,
      corrected_class || null,
      waste_category || null,
      id
    );

    res.json({
      success: true,
      message: approved ? 'Training candidate approved for dataset.' : 'Training candidate rejected.',
      id,
    });
  } catch (err) {
    console.error('[Admin] Review candidate error:', err.message);
    res.status(500).json({ error: 'Failed to review training candidate' });
  }
});

// ─── GET /api/admin/user-corrections ─────────────────────────────────────────
router.get('/user-corrections', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = (page - 1) * limit;

  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const resList = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_corrections, [
        sdk.Query.orderDesc('timestamp'),
        sdk.Query.limit(limit),
        sdk.Query.offset(offset),
      ]);

      const items = resList.documents.map(d => ({
        id: d.$id,
        classification_id: d.classification_id,
        user_id: d.user_id,
        original_category: d.original_category,
        corrected_category: d.corrected_category,
        corrected_item: d.corrected_item,
        notes: d.notes,
        timestamp: d.timestamp,
      }));

      return res.json({
        items,
        total: resList.total,
        page,
        limit,
        pages: Math.ceil(resList.total / limit),
      });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    const items = db.prepare(`
      SELECT uc.*, u.name as user_name, c.image_path, c.category as original_category_confirmed
      FROM user_corrections uc
      LEFT JOIN users u ON uc.user_id = u.id
      LEFT JOIN classifications c ON uc.classification_id = c.id
      ORDER BY uc.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM user_corrections').get()?.count || 0;
    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Admin] User corrections error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user corrections' });
  }
});

// ─── GET /api/admin/model-status ──────────────────────────────────────────────
router.get('/model-status', (req, res) => {
  res.json(getModelStatus());
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    if (USE_APPWRITE) {
      const db = getDatabases();
      const [usersRes, classRes, corrRes, pendRes, apprRes] = await Promise.all([
        db.listDocuments(DATABASE_ID, COLLECTIONS.profiles, [sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.user_corrections, [sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [sdk.Query.equal('admin_reviewed', 0), sdk.Query.limit(1)]),
        db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [sdk.Query.equal('admin_approved', 1), sdk.Query.limit(1)]),
      ]);

      return res.json({
        total_users: usersRes.total,
        total_classifications: classRes.total,
        total_corrections: corrRes.total,
        pending_candidates: pendRes.total,
        approved_candidates: apprRes.total,
        model_status: getModelStatus(),
      });
    }

    const { getDb } = require('../database/db');
    const db = getDb();
    res.json({
      total_users: db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0,
      total_classifications: db.prepare('SELECT COUNT(*) as count FROM classifications').get()?.count || 0,
      total_corrections: db.prepare('SELECT COUNT(*) as count FROM user_corrections').get()?.count || 0,
      pending_candidates: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 0').get()?.count || 0,
      approved_candidates: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_approved = 1').get()?.count || 0,
      model_status: getModelStatus(),
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// ─── GET /api/admin/approved-dataset ─────────────────────────────────────────
router.get('/approved-dataset', async (req, res) => {
  try {
    let items = [];
    if (USE_APPWRITE) {
      const db = getDatabases();
      const resList = await db.listDocuments(DATABASE_ID, COLLECTIONS.training_candidates, [
        sdk.Query.equal('admin_approved', 1),
        sdk.Query.orderAsc('timestamp'),
        sdk.Query.limit(5000),
      ]);
      items = resList.documents.map(d => ({
        id: d.$id,
        image_path: d.image_path,
        corrected_class: d.corrected_class,
        waste_category: d.waste_category,
        timestamp: d.timestamp,
      }));
    } else {
      const { getDb } = require('../database/db');
      items = getDb().prepare(`
        SELECT id, image_path, corrected_class, waste_category, timestamp
        FROM training_candidates
        WHERE admin_approved = 1
        ORDER BY timestamp ASC
      `).all();
    }

    res.json({
      total: items.length,
      dataset: items,
      note: 'Use these approved image corrections to retrain your Teachable Machine model.',
      workflow: [
        '1. Collect approved images from image_path references',
        '2. Upload to Teachable Machine (teachablemachine.withgoogle.com)',
        '3. Train new model version',
        '4. Export as TF.js or TFLite',
        '5. Replace files in backend/models/teachable_machine/',
        '6. Restart backend to load new model',
      ],
    });
  } catch (err) {
    console.error('[Admin] Approved dataset error:', err.message);
    res.status(500).json({ error: 'Failed to fetch approved dataset' });
  }
});

module.exports = router;
