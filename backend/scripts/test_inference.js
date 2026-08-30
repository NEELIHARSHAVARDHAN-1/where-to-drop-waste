/**
 * Quick end-to-end inference test.
 * Creates a synthetic 224x224 RGB image (green pixels) and runs it through
 * the TFLite service.
 *
 * Usage: node backend/scripts/test_inference.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Resolve from this script's location: backend/scripts/ → backend/
const backendRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(backendRoot, '.env') });

// Set model dir env so the service can find files
if (!process.env.TF_MODEL_DIR) {
  process.env.TF_MODEL_DIR = path.join(backendRoot, 'models', 'teachable_machine');
}

const { initializeModel, classify, getModelStatus } = require(path.join(backendRoot, 'src/services/vision/tensorflowLiteService'));
const sharp = require('sharp');

async function run() {
  console.log('=== TFLite Inference Test ===\n');

  // ── 1. Initialize model ────────────────────────────────────────────────────
  console.log('[1] Initializing model...');
  await initializeModel();
  const status = getModelStatus();
  console.log('    modelAvailable:', status.modelAvailable);
  console.log('    labels:        ', status.labels);
  console.log('    numTensors:    ', status.numTensors);
  console.log('    numOperators:  ', status.numOperators);
  if (!status.modelAvailable) {
    console.error('\n[FAIL] Model not available:', status.error);
    process.exit(1);
  }
  console.log('    [OK] Model initialized\n');

  // ── 2. Create a synthetic test image (plain green JPEG) ───────────────────
  console.log('[2] Creating synthetic test image (224x224 green)...');
  const testImage = await sharp({
    create: {
      width: 224,
      height: 224,
      channels: 3,
      background: { r: 0, g: 200, b: 50 },
    },
  }).jpeg().toBuffer();
  console.log('    Image size:', testImage.length, 'bytes');
  console.log('    [OK] Synthetic image created\n');

  // ── 3. Run classification ──────────────────────────────────────────────────
  console.log('[3] Running classification...');
  const result = await classify(testImage);
  console.log('    Raw result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('\n[FAIL] Classification failed:', result.error);
    process.exit(1);
  }
  console.log('\n[OK] Classification succeeded:');
  console.log('     className:      ', result.className);
  console.log('     confidence:     ', (result.confidence * 100).toFixed(1) + '%');
  console.log('     allPredictions: ', result.allPredictions.map(p => `${p.className}=${(p.confidence*100).toFixed(1)}%`).join(', '));

  // ── 4. Test with an uploaded image if available ────────────────────────────
  const uploadsDir = path.join(backendRoot, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (files.length > 0) {
      const testFile = path.join(uploadsDir, files[0]);
      console.log(`\n[4] Testing with real upload: ${files[0]}`);
      const fileBuffer = fs.readFileSync(testFile);
      const realResult = await classify(fileBuffer);
      if (realResult.success) {
        console.log(`    [OK] ${realResult.className} @ ${(realResult.confidence * 100).toFixed(1)}%`);
      } else {
        console.warn('    [WARN] Real image test failed:', realResult.error);
      }
    }
  }

  console.log('\n=== TEST PASSED ===');
}

run().catch(e => {
  console.error('\n[FATAL]', e.message);
  console.error(e.stack);
  process.exit(1);
});
