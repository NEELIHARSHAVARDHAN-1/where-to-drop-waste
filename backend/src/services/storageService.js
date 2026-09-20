/**
 * Storage Service (Appwrite Storage)
 *
 * Handles image uploads to Appwrite Storage.
 * Only persists images when required (history, correction, training candidate).
 *
 * Validates: MIME type, extension, file size.
 * Falls back to local disk storage when Appwrite is not configured.
 */

'use strict';

const { sdk, getStorage, BUCKET_ID, USE_APPWRITE } = require('../config/appwrite');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
]);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

/**
 * Validate an uploaded file (multer req.file or equivalent).
 * Returns { valid: true } or { valid: false, error: string }
 */
function validateImageFile(file) {
  if (!file) return { valid: false, error: 'No file provided' };

  // MIME type check
  if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return { valid: false, error: `Invalid file type: ${file.mimetype}. Only images (jpg, png, webp, gif) are allowed.` };
  }

  // Extension check
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Invalid file extension: ${ext}` };
  }

  // Size check
  if (file.size && file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: `File too large. Maximum size: ${MAX_SIZE_BYTES / 1024 / 1024}MB` };
  }

  return { valid: true };
}

/**
 * Upload a file buffer to Appwrite Storage.
 * Returns the Appwrite file ID, or null on failure.
 */
async function uploadImageToAppwrite(buffer, originalName, mimeType) {
  if (!USE_APPWRITE || !BUCKET_ID) {
    console.info('[Storage] Appwrite storage not configured — skipping upload');
    return null;
  }

  const storage = getStorage();
  const fileId = sdk.ID.unique();
  const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
  const fileName = `${Date.now()}-${fileId}${ext}`;

  try {
    const result = await storage.createFile(
      BUCKET_ID,
      fileId,
      sdk.InputFile.fromBuffer(buffer, fileName),
    );
    return result.$id;
  } catch (e) {
    console.error('[Storage] Upload failed:', e.message);
    return null;
  }
}

/**
 * Get a file view URL for a stored image.
 */
function getFileViewUrl(fileId) {
  if (!fileId) return null;
  const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
  const projectId = process.env.APPWRITE_PROJECT_ID;
  if (!BUCKET_ID || !projectId) return null;
  return `${endpoint}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${projectId}`;
}

/**
 * Delete a file from Appwrite Storage.
 */
async function deleteFile(fileId) {
  if (!USE_APPWRITE || !BUCKET_ID || !fileId) return;
  try {
    await getStorage().deleteFile(BUCKET_ID, fileId);
  } catch (e) {
    console.warn('[Storage] Delete failed:', e.message);
  }
}

module.exports = { validateImageFile, uploadImageToAppwrite, getFileViewUrl, deleteFile };
