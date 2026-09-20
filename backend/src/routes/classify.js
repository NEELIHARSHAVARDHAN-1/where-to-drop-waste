const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getClassifier } = require('../services/classifier');
const { classifyImage: classifyImageTF } = require('../services/vision/classificationPipeline');
const { getModelStatus } = require('../services/vision/tensorflowLiteService');
const { mapLabelToCategory } = require('../services/vision/wasteCategoryMapping');
const { calculateImpact } = require('../services/impactService');
const { awardPoints, updateStreak, updateChallengeProgress } = require('../services/appwriteGamificationService');
const { saveClassification, getClassification, updateClassification } = require('../services/classificationService');
const { saveImpact } = require('../services/appwriteImpactService');
const { validateImageFile, uploadImageToAppwrite, getFileViewUrl } = require('../services/storageService');
const { findMatchingLocalRule } = require('../services/ruleService');
const { getWasteItemByCategory } = require('../services/wasteItemService');
const { authMiddleware } = require('../middleware/auth');
const { USE_APPWRITE } = require('../config/appwrite');

const router = express.Router();

// ─── File upload setup ────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Use memory storage when Appwrite storage is enabled (upload to Appwrite, not disk)
// Use disk storage as fallback
const multerStorage = USE_APPWRITE
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: UPLOAD_DIR,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
      },
    });

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return cb(new Error(validation.error));
    }
    cb(null, true);
  },
});

// ─── Helper: extract userId from token (optional auth for classify endpoints) ─
async function extractUserId(req) {
  if (!req.headers.authorization) return null;
  try {
    if (USE_APPWRITE) {
      const { verifyAppwriteToken } = require('../middleware/auth');
      const token = req.headers.authorization.replace('Bearer ', '');
      const user = await verifyAppwriteToken(token);
      return user.$id;
    }
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization.replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_in_production').id;
  } catch {
    return null;
  }
}

// ─── Helper: apply local rules overlay ───────────────────────────────────────
async function applyLocalRules(result, country, state, city) {
  if (!country || !result || !result.category) return result;

  try {
    const rule = await findMatchingLocalRule({
      country,
      state: state || '',
      city: city || '',
      category: result.category,
    });

    if (rule) {
      result.local_rule = {
        bin_label: rule.bin_label,
        bin_color: rule.bin_color,
        collection_schedule: rule.collection_schedule,
        special_instructions: rule.special_instructions,
        notes: rule.notes,
        data_source: rule.data_source || 'sample_data',
        verified: rule.verified === true || rule.verified === 1,
        disclaimer: rule.verified
          ? `Local rule from: ${rule.data_source}`
          : '⚠️ SAMPLE DATA — These rules are for demonstration only. Please verify with your local municipality.',
      };
    } else if (country) {
      result.rule_source = 'general_guidance';
      result.rule_note = 'Verified local recycling rule unavailable. Showing general guidance.';
    }
  } catch {
    /* local rules are optional */
  }

  return result;
}

// ─── Helper: gamification + impact ───────────────────────────────────────────
async function applyGamificationAndImpact(userId, result, classificationId) {
  if (!userId) {
    if (result.found && result.recyclable !== 'no') {
      result.impact = calculateImpact(result.category, result.estimated_weight_grams);
    }
    return;
  }

  try {
    await updateStreak(userId);
    const gamification = await awardPoints(userId, 'CLASSIFY_ITEM');
    result.points_awarded = gamification.pointsEarned;
    result.gamification = gamification;

    if (result.found) {
      const impact = await saveImpact(userId, classificationId, result.category, result.estimated_weight_grams);
      result.impact = impact;

      // Update recycling score in profile
      if (USE_APPWRITE) {
        (async () => {
          try {
            const { getDatabases, DATABASE_ID, COLLECTIONS } = require('../config/appwrite');
            const { sdk } = require('../config/appwrite');
            const db = getDatabases();
            const totalRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
              sdk.Query.equal('user_id', userId),
              sdk.Query.limit(1),
            ]);
            const foundRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
              sdk.Query.equal('user_id', userId),
              sdk.Query.notEqual('category', 'Unknown'),
              sdk.Query.limit(1),
            ]);
            const score = totalRes.total > 0 ? Math.round((foundRes.total / totalRes.total) * 100) : 0;
            await db.updateDocument(DATABASE_ID, COLLECTIONS.profiles, userId, { recycling_score: score });
          } catch {
            /* ignore */
          }
        })();
      } else {
        const { getDb } = require('../database/db');
        const db = getDb();
        const totalCount = db.prepare('SELECT COUNT(*) as c FROM classifications WHERE user_id = ?').get(userId)?.c || 0;
        const foundCount = db.prepare('SELECT COUNT(*) as c FROM classifications WHERE user_id = ? AND category != ?').get(userId, 'Unknown')?.c || 0;
        const score = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;
        db.prepare('UPDATE users SET recycling_score = ? WHERE id = ?').run(score, userId);
      }

      await updateChallengeProgress(userId, result.category);
    }
  } catch (e) {
    console.error('[Classify] Gamification error (non-blocking):', e.message);
  }

  if (result.found && result.recyclable !== 'no' && !result.impact) {
    result.impact = calculateImpact(result.category, result.estimated_weight_grams);
  }
}

// ─── POST /api/classify/persist ───────────────────────────────────────────────
// Receives an in-browser TFLite prediction result and persists it to Appwrite/DB.
// Awards points securely server-side based on authenticated session.
router.post('/persist', [
  body('className').notEmpty().trim().escape(),
  body('confidence').isFloat({ min: 0, max: 1 }),
  body('country').optional().trim().escape(),
  body('state').optional().trim().escape(),
  body('city').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { className, confidence, hint, country, state, city, allPredictions } = req.body;
  const userId = await extractUserId(req);

  const category = mapLabelToCategory(className);
  let dbItem = null;
  try {
    dbItem = await getWasteItemByCategory(category);
  } catch {
    /* ignore */
  }

  const isLowConfidence = confidence < 0.70;

  let result = {
    found: !isLowConfidence && category !== 'Unknown',
    confidence,
    tf_confidence: confidence,
    match_type: isLowConfidence ? 'tf_below_threshold' : 'browser_tflite_classification',
    classifier: 'BrowserTFLiteClassifier',
    is_uncertain: isLowConfidence,
    uncertainty_reason: isLowConfidence
      ? `Unable to confidently identify this item. (Confidence: ${Math.round(confidence * 100)}%, threshold: 70%)`
      : null,
    item_id: dbItem?.id || null,
    item_name: className,
    category: isLowConfidence ? 'Unknown' : category,
    recyclable: isLowConfidence ? 'unknown' : (dbItem?.recyclable || 'unknown'),
    bin_label: dbItem?.bin_label || 'Check local guidelines',
    bin_color: dbItem?.bin_color || 'grey',
    disposal_method: dbItem?.disposal_method || `This item is classified as ${category}. Please follow local disposal guidelines.`,
    preparation_instructions: dbItem?.preparation_instructions || '',
    sustainability_info: dbItem?.sustainability_info || '',
    estimated_weight_grams: dbItem?.estimated_weight_grams || 100,
    circular_economy_tips: [],
    tf_class: className,
    all_predictions: allPredictions || [],
  };

  result = await applyLocalRules(result, country, state, city);
  result.location = { country: country || null, state: state || null, city: city || null };

  try {
    const classificationId = await saveClassification(userId, 'browser_tflite', hint || className, null, result);
    result.classification_id = classificationId;
    await applyGamificationAndImpact(userId, result, classificationId);
  } catch (saveErr) {
    console.warn('[Classify] Persistence failed, returning prediction with warning:', saveErr.message);
    result.save_warning = 'Could not save classification to server. Classification result is still available.';
  }

  return res.json(result);
});

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
  const userId = await extractUserId(req);

  const classifier = getClassifier('text');
  let result = classifier.classify(item);

  result = await applyLocalRules(result, country, state, city);

  try {
    const classificationId = await saveClassification(userId, 'text', item, null, result);
    result.classification_id = classificationId;
    await applyGamificationAndImpact(userId, result, classificationId);
  } catch (saveErr) {
    console.warn('[Classify] Persistence failed:', saveErr.message);
    result.save_warning = 'Could not save classification record to database.';
  }

  res.json(result);
});

// ─── POST /api/classify/image ─────────────────────────────────────────────────
router.post('/image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

  // Validate the uploaded file
  const validation = validateImageFile(req.file);
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  const { hint, country, state, city } = req.body;
  const userId = await extractUserId(req);

  // ── Step 1: Determine image path for TF inference ──────────────────────────
  let imagePath = null;
  let imageUrl = null;
  let imageFileId = null;

  if (USE_APPWRITE && req.file.buffer) {
    // Upload to Appwrite Storage (async, non-blocking for inference)
    imageFileId = await uploadImageToAppwrite(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    imageUrl = imageFileId ? getFileViewUrl(imageFileId) : null;

    // Write a temp file for TF inference
    const tmpPath = path.join(UPLOAD_DIR, `tmp-${uuidv4()}.jpg`);
    try {
      fs.writeFileSync(tmpPath, req.file.buffer);
      imagePath = tmpPath;
    } catch {
      /* ignore */
    }
  } else if (req.file.path) {
    imagePath = req.file.path;
    imageUrl = `/uploads/${req.file.filename}`;
  }

  // ── Step 2: TF classification ─────────────────────────────────────────────
  let tfResult = null;
  let result = null;

  try {
    if (imagePath && fs.existsSync(imagePath)) {
      tfResult = await classifyImageTF(imagePath, { hint });
    } else {
      tfResult = { success: false, error: 'No valid image path for inference', modelAvailable: false };
    }
  } catch (e) {
    tfResult = { success: false, error: e.message, modelAvailable: false };
  } finally {
    // Clean up temp file if we created one
    if (USE_APPWRITE && imagePath && imagePath.includes('tmp-')) {
      try {
        fs.unlinkSync(imagePath);
      } catch {
        /* ignore */
      }
    }
  }

  if (tfResult && tfResult.success && !tfResult.belowThreshold) {
    const category = tfResult.wasteCategory;
    let dbItem = null;
    try {
      dbItem = await getWasteItemByCategory(category);
    } catch {
      /* ignore */
    }

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
    const classifier = getClassifier('text');
    result = classifier.classify(hint);
    result.classifier = 'ImageClassifier+TextFallback';
    result.image_url = imageUrl;
    result.note = 'TensorFlow model not available. Used text hint for classification.';
  } else {
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
      disposal_method: 'AI classification model is currently unavailable. Please type the item name.',
      preparation_instructions: '',
      sustainability_info: '',
      estimated_weight_grams: 100,
      circular_economy_tips: [],
      image_url: imageUrl,
    };
  }

  // ── Step 3: Apply local rules ──────────────────────────────────────────────
  result = await applyLocalRules(result, country, state, city);
  result.location = { country: country || null, state: state || null, city: city || null };

  // ── Step 4: Save + gamification ────────────────────────────────────────────
  try {
    const classificationId = await saveClassification(userId, 'image', hint || null, imageFileId || imagePath, result);
    result.classification_id = classificationId;
    await applyGamificationAndImpact(userId, result, classificationId);

    if (!result.found || result.match_type === 'tf_below_threshold') {
      result.training_candidate_pending = true;
      result.correction_url = `/api/classify/correct/${classificationId}`;
    }
  } catch (saveErr) {
    console.warn('[Classify] Save failed:', saveErr.message);
    result.save_warning = 'Could not persist classification to database.';
  }

  res.json(result);
});

// ─── POST /api/classify/correct ──────────────────────────────────────────────
router.post('/correct', [
  body('classification_id').notEmpty(),
  body('corrected_class').trim().isLength({ min: 1, max: 200 }).escape(),
  body('corrected_category').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { classification_id, corrected_class, corrected_category } = req.body;
  const userId = await extractUserId(req);

  const classification = await getClassification(classification_id);
  if (!classification) return res.status(404).json({ error: 'Classification not found' });

  const wasteCategory = corrected_category || mapLabelToCategory(corrected_class);
  let gamification = null;

  if (USE_APPWRITE) {
    const { getDatabases, DATABASE_ID, COLLECTIONS } = require('../config/appwrite');
    const db = getDatabases();
    const candidateId = uuidv4();

    await db.createDocument(DATABASE_ID, COLLECTIONS.training_candidates, candidateId, {
      classification_id,
      image_path:            classification.image_file_id || classification.image_path || '',
      predicted_class:       classification.input_text || null,
      predicted_confidence:  classification.confidence || 0,
      corrected_class,
      waste_category:        wasteCategory,
      user_id:               userId || null,
      admin_reviewed:        0,
      admin_approved:        0,
      admin_notes:           '',
      reviewed_by:           null,
      reviewed_at:           null,
      timestamp:             new Date().toISOString(),
    });

    await db.createDocument(DATABASE_ID, COLLECTIONS.user_corrections, uuidv4(), {
      classification_id,
      user_id:            userId || null,
      original_category:  classification.category,
      corrected_category: wasteCategory,
      corrected_item:     corrected_class,
      notes:              '',
      timestamp:          new Date().toISOString(),
    });

    await updateClassification(classification_id, { user_confirmed: false, user_correction: corrected_class });

    if (userId) {
      gamification = await awardPoints(userId, 'USER_CORRECTION_SUBMITTED');
    }

    return res.json({
      success: true,
      message: 'Thank you! Your correction has been saved and will be reviewed by an admin.',
      training_candidate_id: candidateId,
      gamification,
    });
  }

  // SQLite fallback
  const { getDb } = require('../database/db');
  const db = getDb();
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

  db.prepare(`
    INSERT INTO user_corrections (id, classification_id, user_id, original_category, corrected_category, corrected_item)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), classification_id, userId || null, classification.category, wasteCategory, corrected_class);

  db.prepare('UPDATE classifications SET user_confirmed = 0, user_correction = ? WHERE id = ?').run(corrected_class, classification_id);

  if (userId) {
    gamification = await awardPoints(userId, 'USER_CORRECTION_SUBMITTED');
  }

  return res.json({
    success: true,
    message: 'Thank you! Your correction has been saved and will be reviewed by an admin.',
    training_candidate_id: candidateId,
    gamification,
  });
});

// ─── POST /api/classify/confirm ───────────────────────────────────────────────
router.post('/confirm', [
  body('classification_id').notEmpty(),
  body('confirmed').isBoolean(),
  body('correction').optional().trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { classification_id, confirmed, correction } = req.body;

  const classification = await getClassification(classification_id);
  if (!classification) return res.status(404).json({ error: 'Classification not found' });

  await updateClassification(classification_id, { user_confirmed: true, user_correction: correction || null });

  const userId = await extractUserId(req);
  let gamification = null;

  if (userId) {
    if (confirmed) {
      gamification = await awardPoints(userId, 'CORRECT_SEGREGATION');
    } else if (correction) {
      if (USE_APPWRITE) {
        const { getDatabases, DATABASE_ID, COLLECTIONS } = require('../config/appwrite');
        const db = getDatabases();
        await db.createDocument(DATABASE_ID, COLLECTIONS.user_corrections, uuidv4(), {
          classification_id,
          user_id:            userId,
          original_category:  classification.category,
          corrected_category: correction,
          corrected_item:     null,
          notes:              '',
          timestamp:          new Date().toISOString(),
        });
      } else {
        const { getDb } = require('../database/db');
        getDb().prepare(`
          INSERT INTO user_corrections (id, classification_id, user_id, original_category, corrected_category, corrected_item)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), classification_id, userId, classification.category, correction, null);
      }
      gamification = await awardPoints(userId, 'USER_CORRECTION_SUBMITTED');
    }
  }

  res.json({ success: true, gamification });
});

// ─── GET /api/classify/history ────────────────────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  const page  = parseInt(req.query.page, 10)  || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  try {
    const result = await require('../services/classificationService').getUserClassificationHistory(req.user.id, page, limit);
    res.json(result);
  } catch (e) {
    console.error('[Classify] History error:', e.message);
    res.status(500).json({ error: 'Failed to fetch classification history' });
  }
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
      requiredFiles: ['model_unquant.tflite', 'labels.txt'],
      note: 'Export your model from teachablemachine.withgoogle.com — choose "TensorFlow Lite" export.',
    },
  });
});

module.exports = router;
