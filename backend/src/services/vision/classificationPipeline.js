/**
 * Classification Pipeline
 *
 * Orchestrates the full classification workflow:
 *   Image → Validation → Preprocessing → TF Model → Mapping → Rules → Result
 *
 * This is the single entry point for image classification.
 * Both camera captures and file uploads use this same pipeline.
 */

'use strict';

const { readAndValidateImage } = require('./preprocessing');
const { classify: tfClassify, getModelStatus } = require('./tensorflowLiteService');
const { mapLabelToCategory } = require('./wasteCategoryMapping');

const CONFIDENCE_THRESHOLD = parseFloat(process.env.TF_CONFIDENCE_THRESHOLD) || 0.70;

/**
 * Full image classification pipeline.
 *
 * @param {string} imagePath  - Absolute path to the uploaded image file
 * @param {object} options    - Optional overrides
 * @param {string} [options.hint] - Optional text hint for fallback
 * @returns {Promise<ClassificationResult>}
 */
async function classifyImage(imagePath, options = {}) {
  // 1. Validate image
  const validation = readAndValidateImage(imagePath);
  if (!validation.valid) {
    return {
      success: false,
      pipeline_stage: 'image_validation',
      error: validation.error,
      modelAvailable: false,
    };
  }

  // 2. Check model availability before running inference
  const modelStatus = getModelStatus();

  // 3. Run TF inference
  const tfResult = await tfClassify(validation.buffer);

  // 4. Model unavailable
  if (!tfResult.modelAvailable) {
    return {
      success: false,
      pipeline_stage: 'model_inference',
      error: 'AI classification model is currently unavailable.',
      modelAvailable: false,
      modelStatus,
    };
  }

  // 5. Inference error
  if (!tfResult.success) {
    return {
      success: false,
      pipeline_stage: 'model_inference',
      error: tfResult.error || 'Classification failed.',
      modelAvailable: true,
      modelStatus,
    };
  }

  const { className, confidence, allPredictions } = tfResult;

  // 6. Confidence threshold check
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      success: true,
      pipeline_stage: 'confidence_check',
      modelAvailable: true,
      belowThreshold: true,
      className,
      confidence,
      allPredictions,
      wasteCategory: null,
      message: 'Unable to confidently identify this item.',
      canRetry: true,
      canCorrect: true,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
    };
  }

  // 7. Map to waste category
  const wasteCategory = mapLabelToCategory(className);

  return {
    success: true,
    pipeline_stage: 'complete',
    modelAvailable: true,
    belowThreshold: false,
    className,
    confidence,
    allPredictions,
    wasteCategory,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    modelType: tfResult.modelType,
  };
}

/**
 * Returns the configured confidence threshold.
 */
function getConfidenceThreshold() {
  return CONFIDENCE_THRESHOLD;
}

module.exports = { classifyImage, getConfidenceThreshold };
