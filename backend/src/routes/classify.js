const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { getClassifier } = require('../services/classifier');
const { classifyImage } = require('../services/vision/classificationPipeline');
const { getModelStatus } = require('../services/vision/tensorflowLiteService');
const { mapLabelToCategory } = require('../services/vision/wasteCategoryMapping');
const { calculateImpact } = require('../services/impactService');
const { awardPoints, updateStreak } = require('../services/gamificationService');
const { authMiddleware } = require('./auth');

const router = express.Router();

// ─── File upload setup ────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, png, webp, gif)'));
    }
  },
});

// ─── Helper: extract userId from token ───────────────────────────────────────
function extractUserId(req) {
  if (!req.headers.authorization) return null;
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization.replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_in_production').id;
  } catch { return null; }
}

// ─── Helper: save classification to DB ───────────────────────────────────────
function saveClassification(userId, method, inputText, imagePath, result) {
  const db = getDb();
  const id = uuidv4();
  const confidence = result.confidence || result.tf_confidence || 0;
  db.prepare(`
    INSERT INTO classifications 
    (id, user_id, input_text, image_path, method, matched_item_id, category, recyclable, disposal_method, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId || null, inputText || null, imagePath || null, method,
    result.item_id || null, result.category, result.recyclable, result.disposal_method, confidence);
  return id;
}

// ─── Helper: apply local rules overlay ───────────────────────────────────────
function applyLocalRules(result, country, state, city) {
  if (!country) return result;
  const db = getDb();

  const rule = db.prepare(`
    SELECT * FROM local_rules 
    WHERE country = ? 
      AND (state = ? OR state = '') 
      AND (city = ? OR city = '') 
      AND category = ?
    ORDER BY 
      CASE WHEN city = ? THEN 3 WHEN state = ? THEN 2 ELSE 1 END DESC
    LIMIT 1
  `).get(country, state || '', city || '', result.category, city || '', state || '');

  if (rule) {
    result.local_rule = {
      bin_label: rule.bin_label,
      bin_color: rule.bin_color,
      collection_schedule: rule.collection_schedule,
      special_instructions: rule.special_instructions,
      notes: rule.notes,
      data_source: rule.data_source || 'sample_data',
      verified: rule.verified === 1,
      disclaimer: rule.verified
        ? `Local rule from: ${rule.data_source}`
        : '⚠️ SAMPLE DATA — These rules are for demonstration only. Please verify with your local municipality.',
    };
  } else if (country) {
    result.rule_source = 'general_guidance';
    result.rule_note = 'Verified local recycling rule unavailable. Showing general guidance.';
  }
  return result;
}

// ─── Helper: gamification + impact ───────────────────────────────────────────
function applyGamificationAndImpact(userId, result, classificationId) {
  const db = getDb();

  if (userId) {
    updateStreak(userId);
    const gamification = awardPoints(userId, 'CLASSIFY_ITEM');
    result.points_awarded = gamification.pointsEarned;
    result.gamification = gamification;

    if (result.found) {
      const impact = calculateImpact(result.category, result.estimated_weight_grams);
      db.prepare(`
        INSERT INTO impacts (id, user_id, classification_id, waste_category, weight_grams, co2_saved_grams, water_saved_ml, energy_saved_wh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), userId, classificationId, result.category, impact.weight_grams, impact.co2_saved_grams, impact.water_saved_ml, impact.energy_saved_wh);

      const totalCount = db.prepare('SELECT COUNT(*) as c FROM classifications WHERE user_id = ?').get(userId).c;
      const foundCount = db.prepare('SELECT COUNT(*) as c FROM classifications WHERE user_id = ? AND category != ?').get(userId, 'Unknown').c;
      const score = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;
      db.prepare('UPDATE users SET recycling_score = ? WHERE id = ?').run(score, userId);

      updateChallengeProgress(userId, result.category);
    }
  }

  if (result.found && result.recyclable !== 'no') {
    result.impact = calculateImpact(result.category, result.estimated_weight_grams);
  }
}

// ─── POST /api/classify/text ──────────────────────────────────────────────────
router.post('/text', [
  body('item').trim().isLength({ min: 1, max: 200 }).escape(),
  body('country').optional().trim().escape(),
  body('state').optional().trim().escape(),
  body('city').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { item, country, state, city } = req.body;
  const userId = extractUserId(req);

  const classifier = getClassifier('text');
  let result = classifier.classify(item);

  result = applyLocalRules(result, country, state, city);

  const classificationId = saveClassification(userId, 'text', item, null, result);
  result.classification_id = classificationId;

  applyGamificationAndImpact(userId, result, classificationId);

  res.json(result);
});

// ─── POST /api/classify/image ─────────────────────────────────────────────────
// Handles both file uploads and camera captures.
// Uses the TF/Teachable Machine pipeline when the model is available;
// falls back to text-hint classification when the model is not present.
router.post('/image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

  const { hint, country, state, city } = req.body;
  const userId = extractUserId(req);
  const imagePath = req.file.path;
  const imageUrl = `/uploads/${req.file.filename}`;

  // ── Step 1: Try TF classification ─────────────────────────────────────────
  let tfResult = null;
  let result = null;

  try {
    tfResult = await classifyImage(imagePath, { hint });
  } catch (e) {
    tfResult = { success: false, error: e.message, modelAvailable: false };
  }

  if (tfResult && tfResult.success && !tfResult.belowThreshold) {
    // TF succeeded with high confidence → build full result from waste item DB
    const category = tfResult.wasteCategory;
    const db = getDb();
    const dbItem = db.prepare('SELECT * FROM waste_items WHERE category = ? LIMIT 1').get(category);

    result = {
      found: true,
      confidence: tfResult.confidence,
      tf_confidence: tfResult.confidence,
      match_type: 'tf_image_classification',
      classifier: 'TensorflowClassifier',
      is_uncertain: false,
      uncertainty_reason: null,
      item_id: dbItem?.id || null,
      item_name: tfResult.className,
      category,
      recyclable: dbItem?.recyclable || 'unknown',
      bin_label: dbItem?.bin_label || 'Check local guidelines',
      bin_color: dbItem?.bin_color || 'grey',
      disposal_method: dbItem?.disposal_method || `This item is classified as ${category}. Please follow local disposal guidelines.`,
      preparation_instructions: dbItem?.preparation_instructions || '',
      sustainability_info: dbItem?.sustainability_info || '',
      estimated_weight_grams: dbItem?.estimated_weight_grams || 100,
      circular_economy_tips: [],
      image_url: imageUrl,
      tf_class: tfResult.className,
      all_predictions: tfResult.allPredictions,
    };

  } else if (tfResult && tfResult.success && tfResult.belowThreshold) {
    // TF ran but confidence too low → return uncertain result
    result = {
      found: false,
      confidence: tfResult.confidence,
      tf_confidence: tfResult.confidence,
      match_type: 'tf_below_threshold',
      classifier: 'TensorflowClassifier',
      is_uncertain: true,
      uncertainty_reason: `Unable to confidently identify this item. (Confidence: ${Math.round(tfResult.confidence * 100)}%, threshold: ${Math.round(tfResult.confidenceThreshold * 100)}%)`,
      item_id: null,
      item_name: hint || 'Unknown (image)',
      category: 'Unknown',
      recyclable: 'unknown',
      bin_label: 'Check local guidelines',
      bin_color: 'grey',
      disposal_method: 'Unable to confidently classify this item. Please try with a clearer image or use manual entry.',
      preparation_instructions: '',
      sustainability_info: '',
      estimated_weight_grams: 100,
      circular_economy_tips: [],
      image_url: imageUrl,
      can_retry: true,
      can_correct: true,
      tf_class: tfResult.className,
      all_predictions: tfResult.allPredictions,
    };

  } else if (tfResult && !tfResult.modelAvailable && hint) {
    // Model not available but hint provided → text fallback
    const classifier = getClassifier('text');
    result = classifier.classify(hint);
    result.classifier = 'ImageClassifier+TextFallback';
    result.image_path = imagePath;
    result.image_url = imageUrl;
    result.note = 'TensorFlow model not available. Used text hint for classification. Place Teachable Machine model files in backend/models/teachable_machine/ to enable AI image classification.';

  } else {
    // Model not available and no hint
    result = {
      found: false,
      confidence: 0,
      match_type: 'model_unavailable',
      classifier: 'TensorflowClassifier',
      is_uncertain: true,
      uncertainty_reason: tfResult?.error || 'AI classification model is currently unavailable.',
      item_id: null,
      item_name: 'Unknown (image)',
      category: 'Unknown',
      recyclable: 'unknown',
      bin_label: 'Check local guidelines',
      bin_color: 'grey',
      disposal_method: 'AI classification model is currently unavailable. Please type the item name for text-based classification, or provide a hint.',
      preparation_instructions: '',
      sustainability_info: '',
      estimated_weight_grams: 100,
      circular_economy_tips: [],
      image_url: imageUrl,
      model_setup_note: 'Place Teachable Machine model files in backend/models/teachable_machine/ to enable AI image classification.',
    };
  }

  // ── Step 2: Apply local rules ──────────────────────────────────────────────
  result = applyLocalRules(result, country, state, city);
  result.location = { country: country || null, state: state || null, city: city || null };

  // ── Step 3: Save + gamification ────────────────────────────────────────────
  const classificationId = saveClassification(userId, 'image', hint || null, imagePath, result);
  result.classification_id = classificationId;

  applyGamificationAndImpact(userId, result, classificationId);

  // ── Step 4: If below threshold or unknown, create training candidate stub ──
  if (!result.found || result.match_type === 'tf_below_threshold') {
    result.training_candidate_pending = true;
    result.correction_url = `/api/classify/correct/${classificationId}`;
  }

  res.json(result);
});

// ─── POST /api/classify/correct ──────────────────────────────────────────────
// User corrects a classification — stores as training candidate
router.post('/correct', [
  body('classification_id').notEmpty(),
  body('corrected_class').trim().isLength({ min: 1, max: 200 }).escape(),
  body('corrected_category').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { classification_id, corrected_class, corrected_category } = req.body;
  const userId = extractUserId(req);
  const db = getDb();

  const classification = db.prepare('SELECT * FROM classifications WHERE id = ?').get(classification_id);
  if (!classification) return res.status(404).json({ error: 'Classification not found' });

  // Determine waste category from corrected class if not supplied
  const wasteCategory = corrected_category || mapLabelToCategory(corrected_class);

  // Save to training_candidates
  const candidateId = uuidv4();
  db.prepare(`
    INSERT INTO training_candidates 
    (id, classification_id, image_path, predicted_class, predicted_confidence, corrected_class, waste_category, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candidateId,
    classification_id,
    classification.image_path || '',
    classification.input_text || null,
    classification.confidence || 0,
    corrected_class,
    wasteCategory,
    userId || null
  );

  // Also save to user_corrections for backward compat
  db.prepare(`
    INSERT INTO user_corrections (id, classification_id, user_id, original_category, corrected_category, corrected_item)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), classification_id, userId || null, classification.category, wasteCategory, corrected_class);

  // Update classification record
  db.prepare('UPDATE classifications SET user_confirmed = 0, user_correction = ? WHERE id = ?').run(corrected_class, classification_id);

  let gamification = null;
  if (userId) {
    gamification = awardPoints(userId, 'USER_CORRECTION_SUBMITTED');
  }

  res.json({
    success: true,
    message: 'Thank you! Your correction has been saved and will be reviewed by an admin for future model improvement.',
    training_candidate_id: candidateId,
    gamification,
  });
});

// ─── POST /api/classify/confirm ───────────────────────────────────────────────
router.post('/confirm', [
  body('classification_id').notEmpty(),
  body('confirmed').isBoolean(),
  body('correction').optional().trim().escape(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { classification_id, confirmed, correction } = req.body;
  const db = getDb();

  const classification = db.prepare('SELECT * FROM classifications WHERE id = ?').get(classification_id);
  if (!classification) return res.status(404).json({ error: 'Classification not found' });

  db.prepare('UPDATE classifications SET user_confirmed = 1, user_correction = ? WHERE id = ?').run(correction || null, classification_id);

  const userId = extractUserId(req);
  let gamification = null;
  if (userId) {
    if (confirmed) {
      gamification = awardPoints(userId, 'CORRECT_SEGREGATION');
    } else if (correction) {
      db.prepare(`
        INSERT INTO user_corrections (id, classification_id, user_id, original_category, corrected_category, corrected_item)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), classification_id, userId, classification.category, correction, null);
      gamification = awardPoints(userId, 'USER_CORRECTION_SUBMITTED');
    }
  }

  res.json({ success: true, gamification });
});

// ─── GET /api/classify/history ────────────────────────────────────────────────
router.get('/history', authMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  const items = db.prepare(`
    SELECT * FROM classifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM classifications WHERE user_id = ?').get(req.user.id).count;

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
});

// ─── GET /api/classify/model-status ──────────────────────────────────────────
router.get('/model-status', (req, res) => {
  const status = getModelStatus();
  res.json({
    modelAvailable: status.modelAvailable,
    modelType: status.modelType,
    labels: status.labels,
    inputSize: status.inputSize,
    error: status.error,
    setupInstructions: status.modelAvailable ? null : {
      message: 'Place your Teachable Machine model files in backend/models/teachable_machine/',
      requiredFiles: ['model.json', 'weights.bin (or shards)', 'metadata.json'],
      alternativeFiles: ['model.tflite', 'metadata.json'],
      note: 'Export your model from teachablemachine.withgoogle.com — choose "TensorFlow.js" or "TensorFlow Lite" export.',
    },
  });
});

// ─── Helper: update challenge progress ───────────────────────────────────────
function updateChallengeProgress(userId, category) {
  const db = getDb();
  const activeChallenges = db.prepare(`
    SELECT uc.*, c.target_value, c.points_reward FROM user_challenges uc
    JOIN challenges c ON uc.challenge_id = c.id
    WHERE uc.user_id = ? AND uc.completed = 0 AND c.end_date >= date('now')
  `).all(userId);

  for (const uc of activeChallenges) {
    const newProgress = uc.progress + 1;
    if (newProgress >= uc.target_value) {
      db.prepare('UPDATE user_challenges SET progress = ?, completed = 1, completed_at = datetime("now") WHERE user_id = ? AND challenge_id = ?')
        .run(newProgress, userId, uc.challenge_id);
      awardPoints(userId, 'COMPLETE_CHALLENGE', uc.points_reward - 100);
    } else {
      db.prepare('UPDATE user_challenges SET progress = ? WHERE user_id = ? AND challenge_id = ?')
        .run(newProgress, userId, uc.challenge_id);
    }
  }
}

module.exports = router;
