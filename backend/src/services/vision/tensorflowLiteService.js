/**
 * TensorFlow Lite Inference Service for Node.js
 *
 * Runs the actual model_unquant.tflite from Google Teachable Machine.
 *
 * Approach:
 *   - Spawn a Python 3.10 child process running tflite_infer.py
 *   - Python uses tensorflow.lite.Interpreter for actual TFLite inference
 *   - Node.js reads the JSON result from stdout
 *   - This avoids the need for @tensorflow/tfjs-node native bindings
 *     (which require VS Build Tools and NAPI v4 — unavailable in this environment)
 *
 * Model specification (verified from binary analysis of model_unquant.tflite):
 *   Input:  float32 [1, 224, 224, 3]  — normalized RGB pixels in [0, 1]
 *   Output: float32 [1, 2]            — softmax probabilities for 2 classes
 *   Labels: 0=harsha, 1=bottle        — from labels.txt
 *   Type:   UNQUANTIZED (float32 throughout)
 *   Size:   2,090,332 bytes
 *
 * Python requirement:
 *   Python 3.10 with tensorflow (2.20+) and Pillow installed.
 *   Detected at: py -3.10
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const MODEL_DIR = process.env.TF_MODEL_DIR
  ? path.resolve(process.env.TF_MODEL_DIR)
  : path.join(__dirname, '../../../models/teachable_machine');

const MODEL_PATH   = path.join(MODEL_DIR, 'model_unquant.tflite');
const LABELS_PATH  = path.join(MODEL_DIR, 'labels.txt');
const INFER_SCRIPT = path.join(__dirname, 'tflite_infer.py');

// ── Verified model specification ─────────────────────────────────────────────
const MODEL_SPEC = {
  inputShape:  [1, 224, 224, 3],
  inputType:   'float32',
  outputShape: [1, 2],
  outputType:  'float32',
  normalize:   true,       // divide by 255.0
  quantized:   false,
};

// ── Module state ─────────────────────────────────────────────────────────────
let _labels         = null;
let _initialized    = false;
let _modelAvailable = false;
let _initError      = null;
let _pythonCmd      = null;  // e.g. 'py' with args ['-3.10']

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Labels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse labels.txt. Teachable Machine format:
 *   0 classname
 *   1 classname
 * Returns array of class names in index order.
 */
function parseLabels(labelsPath) {
  const text = fs.readFileSync(labelsPath, 'utf8');
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const labels = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) {
      labels[parseInt(m[1], 10)] = m[2].trim();
    } else if (line.trim()) {
      labels.push(line.trim());
    }
  }
  return labels;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Python child process runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the correct Python command for this platform.
 * Returns { cmd, args } where spawning cmd with args runs Python 3.10+.
 */
async function detectPython() {
  const candidates = [
    // Windows py launcher with version spec
    { cmd: 'py', args: ['-3.10'] },
    { cmd: 'py', args: ['-3'] },
    // Direct paths
    { cmd: 'python3.10', args: [] },
    { cmd: 'python3', args: [] },
    { cmd: 'python', args: [] },
  ];

  for (const candidate of candidates) {
    try {
      const ok = await new Promise((resolve) => {
        const p = spawn(candidate.cmd, [...candidate.args, '--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
          windowsHide: true,
        });
        let out = '';
        p.stdout.on('data', d => { out += d.toString(); });
        p.stderr.on('data', d => { out += d.toString(); });
        p.on('close', (code) => {
          // Accept any Python 3.x
          const match = out.match(/Python\s+(\d+)\.(\d+)/);
          if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            resolve(major === 3 && minor >= 9);
          } else {
            resolve(false);
          }
        });
        p.on('error', () => resolve(false));
      });
      if (ok) return candidate;
    } catch (e) {
      // Try next
    }
  }
  return null;
}

/**
 * Run the Python inference script with the given image file.
 * Returns the parsed JSON result.
 *
 * @param {string} imageFilePath - Path to a JPEG/PNG/WebP image file on disk
 * @returns {Promise<object>} - Parsed JSON from Python stdout
 */
async function runPythonInference(imageFilePath) {
  if (!_pythonCmd) {
    throw new Error('Python not available for TFLite inference.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      ..._pythonCmd.args,
      INFER_SCRIPT,
      MODEL_PATH,
      LABELS_PATH,
      imageFilePath,
    ];

    const child = spawn(_pythonCmd.cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        TF_CPP_MIN_LOG_LEVEL: '3',
        TF_ENABLE_ONEDNN_OPTS: '0',
        PYTHONWARNINGS: 'ignore',
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', (code) => {
      // Parse the JSON output line from stdout (ignore exit code — Python may exit 1 due to warnings)
      const jsonLine = stdout.trim().split('\n').find(l => l.trim().startsWith('{'));
      if (jsonLine) {
        try {
          const result = JSON.parse(jsonLine);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}. stdout=${stdout.slice(0, 200)}`));
        }
      } else if (code !== 0) {
        reject(new Error(`Python inference process exited with code ${code}. stderr=${stderr.slice(0, 500)}`));
      } else {
        reject(new Error(`No JSON output from Python inference. stdout=${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', (e) => {
      reject(new Error(`Failed to spawn Python process: ${e.message}`));
    });

    // Timeout
    setTimeout(() => {
      child.kill();
      reject(new Error('Python inference timed out (30s)'));
    }, 30000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Image preprocessing (write buffer to temp file for Python)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write image buffer to a temporary file, run inference, then clean up.
 * Uses sharp to validate/normalize the image to JPEG first.
 *
 * @param {Buffer} imageBuffer - Raw image bytes (JPEG/PNG/WebP/GIF)
 * @returns {Promise<object>} Inference result JSON
 */
async function classifyBuffer(imageBuffer) {
  const sharp = require('sharp');

  // Convert to JPEG — ensures Python's PIL can always read it
  let jpegBuffer;
  try {
    jpegBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (e) {
    throw new Error(`Image conversion failed: ${e.message}`);
  }

  // Write to temp file
  const tmpFile = path.join(os.tmpdir(), `wtdw_infer_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    fs.writeFileSync(tmpFile, jpegBuffer);
    const result = await runPythonInference(tmpFile);
    return result;
  } finally {
    // Always clean up
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Initialization and public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the TFLite service: verify model files exist, detect Python, load labels.
 * Idempotent — safe to call multiple times.
 */
async function initializeModel() {
  if (_initialized) return;
  _initialized = true;

  // Check labels file
  if (!fs.existsSync(LABELS_PATH)) {
    _initError = `labels.txt not found at: ${LABELS_PATH}`;
    console.warn(`[TFLiteService] ${_initError}`);
    return;
  }

  // Check model file
  if (!fs.existsSync(MODEL_PATH)) {
    _initError = `model_unquant.tflite not found at: ${MODEL_PATH}`;
    console.warn(`[TFLiteService] ${_initError}`);
    return;
  }

  // Check inference script
  if (!fs.existsSync(INFER_SCRIPT)) {
    _initError = `tflite_infer.py not found at: ${INFER_SCRIPT}`;
    console.warn(`[TFLiteService] ${_initError}`);
    return;
  }

  // Load labels
  try {
    _labels = parseLabels(LABELS_PATH);
    console.log(`[TFLiteService] Labels loaded: ${_labels.join(', ')}`);
  } catch (e) {
    _initError = `Failed to parse labels.txt: ${e.message}`;
    console.warn(`[TFLiteService] ${_initError}`);
    return;
  }

  // Detect Python
  try {
    _pythonCmd = await detectPython();
    if (!_pythonCmd) {
      _initError = 'Python 3.9+ not found. Install Python 3.10 to enable TFLite inference.';
      console.warn(`[TFLiteService] ${_initError}`);
      return;
    }
    console.log(`[TFLiteService] Python detected: ${_pythonCmd.cmd} ${_pythonCmd.args.join(' ')}`);
  } catch (e) {
    _initError = `Python detection failed: ${e.message}`;
    console.warn(`[TFLiteService] ${_initError}`);
    return;
  }

  _modelAvailable = true;
  MODEL_SPEC.numClasses = _labels.length;
  console.log(`[TFLiteService] Ready. Model: model_unquant.tflite, Classes: ${_labels.join(', ')}`);
}

/**
 * Run inference on an image buffer.
 *
 * @param {Buffer} imageBuffer — raw JPEG/PNG/WebP bytes
 * @returns {Promise<InferenceResult>}
 */
async function classify(imageBuffer) {
  if (!_initialized) await initializeModel();

  if (!_modelAvailable) {
    return {
      success: false,
      modelAvailable: false,
      error: _initError || 'TFLite model is currently unavailable.',
    };
  }

  try {
    const result = await classifyBuffer(imageBuffer);

    if (!result.success) {
      return {
        success: false,
        modelAvailable: true,
        error: result.error || 'Inference failed.',
      };
    }

    const { className, confidence, classIndex, allPredictions, numClasses } = result;

    return {
      success: true,
      modelAvailable: true,
      className,
      confidence,
      classIndex,
      allPredictions,
      numClasses,
      modelType: 'TFLite_UNQUANTIZED_FLOAT32',
    };
  } catch (e) {
    return {
      success: false,
      modelAvailable: true,
      error: `Inference failed: ${e.message}`,
    };
  }
}

/**
 * Returns current model status for admin/health endpoints.
 * Never exposes raw filesystem paths to normal users.
 */
function getModelStatus() {
  return {
    initialized:    _initialized,
    modelAvailable: _modelAvailable,
    modelType:      'TFLite_UNQUANTIZED_FLOAT32',
    backend:        'Python TFLite (tensorflow 2.20)',
    inputShape:     MODEL_SPEC.inputShape,
    inputType:      MODEL_SPEC.inputType,
    outputShape:    MODEL_SPEC.outputShape,
    outputType:     MODEL_SPEC.outputType,
    quantized:      MODEL_SPEC.quantized,
    labels:         _labels || [],
    numClasses:     _labels ? _labels.length : 0,
    error:          _initError || null,
    setupNote: _modelAvailable ? null :
      'Place model_unquant.tflite and labels.txt in backend/models/teachable_machine/',
  };
}

/**
 * Return the loaded labels array.
 */
function getLabels() {
  return _labels || [];
}

/**
 * Return the input size (height = width for square models).
 */
function getInputSize() {
  return MODEL_SPEC.inputShape[1];
}

module.exports = {
  initializeModel,
  classify,
  getModelStatus,
  getLabels,
  getInputSize,
  MODEL_SPEC,
};
