/**
 * Admin Routes
 *
 * Provides admin-only endpoints for:
 *   - Viewing training candidates (unrecognized/corrected images)
 *   - Reviewing and approving/rejecting training candidates
 *   - Viewing user corrections
 *   - Model status
 *
 * Admin access is granted by adding a row to the admin_users table.
 * See: POST /api/admin/grant (protected — only usable when no admins exist yet)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../database/db');
const { authMiddleware } = require('./auth');
const { getModelStatus } = require('../services/vision/tensorflowLiteService');

const router = express.Router();

// ─── Admin check middleware ───────────────────────────────────────────────────
function adminMiddleware(req, res, next) {
  const db = getDb();
  const admin = db.prepare('SELECT id FROM admin_users WHERE user_id = ?').get(req.user.id);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// All admin routes require authentication
router.use(authMiddleware);

// ─── POST /api/admin/grant ────────────────────────────────────────────────────
// Grant admin to first user (bootstrap). Only works when admin_users is empty.
router.post('/grant', [
  body('user_id').optional().trim(),
], (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (existing && existing.count > 0) {
    return res.status(403).json({ error: 'Admin already exists. Contact an existing admin to grant access.' });
  }
  const targetUserId = req.body.user_id || req.user.id;
  db.prepare('INSERT OR IGNORE INTO admin_users (id, user_id, granted_by) VALUES (?, ?, ?)')
    .run(uuidv4(), targetUserId, req.user.id);
  res.json({ success: true, message: `Admin granted to user ${targetUserId}` });
});

// All subsequent routes require admin
router.use(adminMiddleware);

// ─── GET /api/admin/training-candidates ──────────────────────────────────────
router.get('/training-candidates', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status; // 'pending' | 'approved' | 'rejected'

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

  // Stats
  const stats = {
    pending: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 0').get()?.count || 0,
    approved: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 1 AND admin_approved = 1').get()?.count || 0,
    rejected: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 1 AND admin_approved = 0').get()?.count || 0,
  };

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit), stats });
});

// ─── POST /api/admin/training-candidates/:id/review ──────────────────────────
router.post('/training-candidates/:id/review', [
  body('approved').isBoolean(),
  body('notes').optional().trim().escape(),
  body('corrected_class').optional().trim().escape(),
  body('waste_category').optional().trim().escape(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id } = req.params;
  const { approved, notes, corrected_class, waste_category } = req.body;
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
});

// ─── GET /api/admin/user-corrections ─────────────────────────────────────────
router.get('/user-corrections', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

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
});

// ─── GET /api/admin/model-status ──────────────────────────────────────────────
router.get('/model-status', (req, res) => {
  res.json(getModelStatus());
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();
  res.json({
    total_users: db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0,
    total_classifications: db.prepare('SELECT COUNT(*) as count FROM classifications').get()?.count || 0,
    total_corrections: db.prepare('SELECT COUNT(*) as count FROM user_corrections').get()?.count || 0,
    pending_candidates: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_reviewed = 0').get()?.count || 0,
    approved_candidates: db.prepare('SELECT COUNT(*) as count FROM training_candidates WHERE admin_approved = 1').get()?.count || 0,
    model_status: getModelStatus(),
  });
});

// ─── GET /api/admin/approved-dataset ─────────────────────────────────────────
// Download the approved training dataset manifest for offline model training
router.get('/approved-dataset', (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT id, image_path, corrected_class, waste_category, timestamp
    FROM training_candidates
    WHERE admin_approved = 1
    ORDER BY timestamp ASC
  `).all();

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
});

module.exports = router;
