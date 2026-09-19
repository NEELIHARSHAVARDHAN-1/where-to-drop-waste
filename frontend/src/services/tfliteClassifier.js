/**
 * Browser-side TFLite Classifier
 *
 * Runs the Teachable Machine model_unquant.tflite entirely in the browser
 * using @tensorflow/tfjs + @tensorflow/tfjs-tflite (WASM backend).
 *
 * Architecture:
 *   Camera / Upload
 *       ↓
 *   loadModel()  ← runs once, result cached
 *       ↓
 *   classifyImage(imageElement | canvas | blob)
 *       ↓
 *   { className, confidence, allPredictions }
 *       ↓
 *   Result displayed immediately (no backend round-trip for inference)
 *       ↓
 *   Backend called only to PERSIST the result + award points
 *
 * Model spec (verified from binary analysis):
 *   Input:  float32 [1, 224, 224, 3]   — normalized [0, 1]
 *   Output: float32 [1, N]             — softmax probabilities
 *   Labels: loaded from /models/labels.txt
 *
 * Labels format (Teachable Machine):
 *   0 Background
 *   1 Crumpled Paper
 *   ...
 */

import * as tf from '@tensorflow/tfjs';

// ── Module-level singletons — loaded once, reused forever ────────────────────
let _model  = null;   // TFLite model
let _labels = null;   // string[]
let _loading = false;
let _loadPromise = null;
let _error  = null;

const MODEL_URL  = '/models/model_unquant.tflite';
const LABELS_URL = '/models/labels.txt';
const INPUT_SIZE = 224;

// ─────────────────────────────────────────────────────────────────────────────
// Label loading
// ─────────────────────────────────────────────────────────────────────────────
async function loadLabels() {
  const resp = await fetch(LABELS_URL);
  if (!resp.ok) throw new Error(`Failed to fetch labels.txt: ${resp.status}`);
  const text = await resp.text();
  const labels = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (m) {
      labels[parseInt(m[1], 10)] = m[2].trim();
    } else {
      labels.push(trimmed);
    }
  }
  return labels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model loading — uses tfjs-tflite if available, falls back to pure tfjs
// ─────────────────────────────────────────────────────────────────────────────
async function loadModelInternal() {
  // Try @tensorflow/tfjs-tflite (WASM delegate) first
  try {
    const tflite = await import('@tensorflow/tfjs-tflite');
    // Point to the tflite WASM files (hosted by the package)
    tflite.setWasmPath(
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/wasm/'
    );
    const model = await tflite.loadTFLiteModel(MODEL_URL);
    console.log('[TFLite] Loaded via tfjs-tflite WASM delegate');
    return { model, backend: 'tflite-wasm' };
  } catch (e) {
    console.warn('[TFLite] tfjs-tflite unavailable, falling back to pure tfjs:', e.message);
  }

  // Fallback: pure @tensorflow/tfjs with LayersModel
  // The .tflite file cannot be loaded by tfjs directly, so we use a Teachable Machine
  // compatible approach: load via tfjs-tflite CDN converter or signal unavailability
  throw new Error(
    '@tensorflow/tfjs-tflite is required for in-browser TFLite inference. ' +
    'Install it: npm install @tensorflow/tfjs-tflite'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: loadModel() — idempotent, returns cached model
// ─────────────────────────────────────────────────────────────────────────────
export async function loadModel() {
  if (_model && _labels) return { model: _model, labels: _labels };
  if (_error) throw _error;
  if (_loadPromise) return _loadPromise;

  _loading = true;
  _loadPromise = (async () => {
    try {
      await tf.ready();
      const [labelsResult, modelResult] = await Promise.all([
        loadLabels(),
        loadModelInternal(),
      ]);
      _labels = labelsResult;
      _model  = modelResult.model;
      console.log(`[TFLite] Ready. Labels: ${_labels.join(', ')}`);
      return { model: _model, labels: _labels };
    } catch (e) {
      _error = e;
      throw e;
    } finally {
      _loading = false;
    }
  })();

  return _loadPromise;
}

export function isModelLoaded() {
  return !!(_model && _labels);
}

export function isModelLoading() {
  return _loading;
}

export function getModelError() {
  return _error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: classifyImage(source)
//
// source can be:
//   - HTMLImageElement
//   - HTMLVideoElement  (live camera frame)
//   - HTMLCanvasElement (captured frame)
//   - ImageBitmap
//   - Blob / File       (converted internally)
//
// Returns:
//   { className, confidence, allPredictions, error? }
// ─────────────────────────────────────────────────────────────────────────────
export async function classifyImage(source) {
  try {
    if (!_model || !_labels) {
      await loadModel();
    }

    // Convert Blob/File to ImageBitmap for efficient processing
    let imgSource = source;
    if (source instanceof Blob || source instanceof File) {
      imgSource = await createImageBitmap(source);
    }

    // Run inference inside tf.tidy to auto-dispose intermediate tensors
    const result = tf.tidy(() => {
      // Decode image → [H, W, 3] tensor (values 0-255)
      let tensor = tf.browser.fromPixels(imgSource);

      // Resize to 224×224
      tensor = tf.image.resizeBilinear(tensor, [INPUT_SIZE, INPUT_SIZE]);

      // Normalize to [0, 1]  — unquantized float32 model
      tensor = tensor.div(255.0);

      // Add batch dimension: [1, 224, 224, 3]
      tensor = tensor.expandDims(0);

      // Cast to float32 (should already be, but explicit is safe)
      tensor = tensor.cast('float32');

      return tensor;
    });

    // Run model prediction
    let outputTensor;
    try {
      outputTensor = _model.predict(result);
    } finally {
      result.dispose();
    }

    const probabilities = await outputTensor.data();
    outputTensor.dispose();

    const probs = Array.from(probabilities);
    const numClasses = Math.min(probs.length, _labels.length);

    // Find top prediction
    let topIdx = 0;
    for (let i = 1; i < numClasses; i++) {
      if (probs[i] > probs[topIdx]) topIdx = i;
    }

    const allPredictions = Array.from({ length: numClasses }, (_, i) => ({
      className:  _labels[i] || `class_${i}`,
      confidence: probs[i],
    })).sort((a, b) => b.confidence - a.confidence);

    return {
      className:   _labels[topIdx] || `class_${topIdx}`,
      confidence:  probs[topIdx],
      classIndex:  topIdx,
      allPredictions,
    };
  } catch (e) {
    console.error('[TFLite] classifyImage error:', e);
    return {
      className:   null,
      confidence:  0,
      allPredictions: [],
      error: e.message,
    };
  }
}

/**
 * Classify directly from a video element (live camera frame).
 * Draws current frame to an offscreen canvas, then classifies.
 */
export async function classifyVideoFrame(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width  = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, INPUT_SIZE, INPUT_SIZE);
  return classifyImage(canvas);
}

/**
 * Reset module state (useful for testing).
 */
export function resetClassifier() {
  _model  = null;
  _labels = null;
  _loading = false;
  _loadPromise = null;
  _error  = null;
}
