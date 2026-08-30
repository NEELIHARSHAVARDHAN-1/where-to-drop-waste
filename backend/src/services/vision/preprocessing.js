/**
 * Image Preprocessing Utilities
 *
 * Validates and prepares image files before feeding to the TF model.
 * Runs on the backend where the image buffer is available after multer upload.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Allowed MIME signatures (magic bytes)
const MAGIC_BYTES = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],  // RIFF
  gif: [0x47, 0x49, 0x46],
};

/**
 * Validate that a file is actually an image based on magic bytes.
 * @param {Buffer} buffer
 * @returns {{ valid: boolean, format: string|null }}
 */
function validateImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, format: null, error: 'File too small to be a valid image' };
  }

  const bytes = Array.from(buffer.slice(0, 12));

  if (bytes.slice(0, 3).every((b, i) => b === MAGIC_BYTES.jpeg[i])) {
    return { valid: true, format: 'jpeg' };
  }
  if (bytes.slice(0, 4).every((b, i) => b === MAGIC_BYTES.png[i])) {
    return { valid: true, format: 'png' };
  }
  if (bytes.slice(0, 3).every((b, i) => b === MAGIC_BYTES.gif[i])) {
    return { valid: true, format: 'gif' };
  }
  // WebP: RIFF....WEBP
  if (bytes.slice(0, 4).every((b, i) => b === MAGIC_BYTES.webp[i]) &&
    buffer.length >= 12) {
    const webpMarker = buffer.slice(8, 12).toString('ascii');
    if (webpMarker === 'WEBP') {
      return { valid: true, format: 'webp' };
    }
  }

  return { valid: false, format: null, error: 'File does not appear to be a valid image (JPEG, PNG, WebP, GIF)' };
}

/**
 * Read image from disk and validate.
 * @param {string} filePath
 * @returns {{ valid: boolean, buffer: Buffer|null, format: string|null, error: string|null }}
 */
function readAndValidateImage(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, buffer: null, format: null, error: 'Image file not found on disk' };
  }

  const stats = fs.statSync(filePath);
  const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

  if (stats.size > maxSize) {
    return { valid: false, buffer: null, format: null, error: `Image exceeds maximum size of ${maxSize / 1024 / 1024}MB` };
  }

  const buffer = fs.readFileSync(filePath);
  const validation = validateImageBuffer(buffer);

  if (!validation.valid) {
    return { valid: false, buffer: null, format: null, error: validation.error };
  }

  return { valid: true, buffer, format: validation.format, error: null };
}

/**
 * Sanitize a filename to prevent path traversal.
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = {
  validateImageBuffer,
  readAndValidateImage,
  sanitizeFilename,
};
