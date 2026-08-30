/**
 * TensorFlow / Teachable Machine Service
 *
 * Loads and runs inference on a Teachable Machine image model.
 * Supports both TensorFlow.js (model.json + weights) and TensorFlow Lite (.tflite).
 *
 * Model files must be placed in: backend/models/teachable_machine/
 *   - model.json            (TF.js topology)
 *   - weights.bin           (TF.js weights — may be multiple shard files)
 *   - metadata.json         (Teachable Machine metadata with labels)
 *
 *   OR for TFLite:
 *   - model.tflite
 *   - metadata.json
 *
 * If the model files are not present the service gracefully sets
 * modelAvailable = false and returns an error result instead of crashing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_DIR = process.env.TF_MODEL_DIR || path.join(__dirname, '../../../models/teachable_machine');
const METADATA_PATH = path.join(MODEL_DIR, 'metadata.json');
const MODEL_JSON_PATH = path.join(MODEL_DIR, 'model.json');
const MODEL_TFLITE_PATH = path.join(MODEL_DIR, 'model.tflite');

// Cache
let _tf = null;
let _model = null;
let _metadata = null;
let _modelType = null; // 'tfjs' | 'tflite' | null
let _initialized = false;
let _modelAvailable = false;
let _initError = null;

/**
 * Read and validate metadata.json produced by Teachable Machine.
 */
function loadMetadata() {
  if (!fs.existsSync(METADATA_PATH)) {
    throw new Error(`metadata.json not found at: ${METADATA_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  return raw;
}

/**
 * Determine model type from available files.
 */
function detectModelType() {
  if (fs.existsSync(MODEL_JSON_PATH)) return 'tfjs';
  if (fs.existsSync(MODEL_TFLITE_PATH)) return 'tflite';
  return null;
}

/**
 * Initialize TensorFlow and load the model.
 * Called once at startup; safe to call multiple times.
 */
async function initializeModel() {
  if (_initialized) return;
  _initialized = true;

  try {
    _metadata = loadMetadata();
  } catch (e) {
    _initError = `Model metadata missing: ${e.message}. Place Teachable Machine files in backend/models/teachable_machine/.`;
    _modelAvailable = false;
    console.warn(`[TensorflowService] ${_initError}`);
    return;
  }

  _modelType = detectModelType();

  if (_modelType === 'tfjs') {
    try {
      // Dynamically require @tensorflow/tfjs-node — not a hard dependency
      _tf = require('@tensorflow/tfjs-node');
      _model = await _tf.loadLayersModel(`file://${MODEL_JSON_PATH}`);
      _modelAvailable = true;
      console.log(`[TensorflowService] TF.js model loaded. Classes: ${getLabels().join(', ')}`);
    } catch (e) {
      _initError = `Failed to load TF.js model: ${e.message}`;
      _modelAvailable = false;
      console.warn(`[TensorflowService] ${_initError}`);
    }
  } else if (_modelType === 'tflite') {
    // TFLite on Node.js requires @tensorflow/tfjs-tflite or tflite-node
    try {
      const tflite = require('@tensorflow/tfjs-tflite');
      _model = await tflite.loadTFLiteModel(`file://${MODEL_TFLITE_PATH}`);
      _modelAvailable = true;
      console.log(`[TensorflowService] TFLite model loaded. Classes: ${getLabels().join(', ')}`);
    } catch (e) {
      _initError = `Failed to load TFLite model: ${e.message}`;
      _modelAvailable = false;
      console.warn(`[TensorflowService] ${_initError}`);
    }
  } else {
    _initError = `No model file found. Expected model.json or model.tflite in: ${MODEL_DIR}`;
    _modelAvailable = false;
    console.warn(`[TensorflowService] ${_initError}`);
  }
}

/**
 * Extract class labels from metadata.
 */
function getLabels() {
  if (!_metadata) return [];
  // Teachable Machine format: { labels: [...] } or { classes: [...] }
  if (Array.isArray(_metadata.labels)) return _metadata.labels;
  if (Array.isArray(_metadata.classes)) return _metadata.classes;
  // Older TM format: { tflite: { labels: [...] } }
  if (_metadata.tflite && Array.isArray(_metadata.tflite.labels)) return _metadata.tflite.labels;
  return [];
}

/**
 * Get the input size required by the model.
 */
function getInputSize() {
  if (!_metadata) return 224;
  if (_metadata.imageSize) return _metadata.imageSize;
  if (_metadata.image_size) return _metadata.image_size;
  // TM standard: 224x224
  return 224;
}

/**
 * Run inference on a decoded image buffer.
 *
 * @param {Buffer} imageBuffer - Raw image file buffer (JPEG/PNG/WebP)
 * @returns {Promise<{className: string, confidence: number, allPredictions: Array}>}
 */
async function classify(imageBuffer) {
  if (!_initialized) {
    await initializeModel();
  }

  if (!_modelAvailable) {
    return {
      success: false,
      error: _initError || 'AI classification model is currently unavailable.',
      modelAvailable: false,
    };
  }

  try {
    const inputSize = getInputSize();
    const labels = getLabels();

    let predictions;

    if (_modelType === 'tfjs') {
      // Decode and resize image using tfjs-node
      let tensor = _tf.node.decodeImage(imageBuffer, 3);

      // Resize to model input size
      tensor = _tf.image.resizeBilinear(tensor, [inputSize, inputSize]);

      // Normalize to [0, 1] — Teachable Machine models expect this
      tensor = tensor.div(255.0);

      // Add batch dimension: [1, H, W, C]
      tensor = tensor.expandDims(0);

      const output = _model.predict(tensor);
      const data = await output.data();
      predictions = Array.from(data);

      // Cleanup tensors
      tensor.dispose();
      output.dispose();
    } else if (_modelType === 'tflite') {
      // TFLite inference
      const inputTensor = _tf.tensor4d(
        new Float32Array(inputSize * inputSize * 3),
        [1, inputSize, inputSize, 3]
      );
      const result = _model.predict(inputTensor);
      const data = await result.data();
      predictions = Array.from(data);
      inputTensor.dispose();
      result.dispose();
    }

    if (!predictions || predictions.length === 0) {
      return {
        success: false,
        error: 'Model returned empty predictions.',
        modelAvailable: true,
      };
    }

    // Map to label + confidence
    const allPredictions = predictions.map((conf, i) => ({
      className: labels[i] || `class_${i}`,
      confidence: conf,
    })).sort((a, b) => b.confidence - a.confidence);

    const top = allPredictions[0];

    return {
      success: true,
      modelAvailable: true,
      className: top.className,
      confidence: top.confidence,
      allPredictions,
      modelType: _modelType,
      inputSize,
    };
  } catch (e) {
    return {
      success: false,
      error: `Classification error: ${e.message}`,
      modelAvailable: _modelAvailable,
    };
  }
}

/**
 * Returns model status information.
 */
function getModelStatus() {
  return {
    initialized: _initialized,
    modelAvailable: _modelAvailable,
    modelType: _modelType,
    modelDir: MODEL_DIR,
    labels: getLabels(),
    inputSize: getInputSize(),
    error: _initError || null,
  };
}

module.exports = {
  initializeModel,
  classify,
  getLabels,
  getInputSize,
  getModelStatus,
};
