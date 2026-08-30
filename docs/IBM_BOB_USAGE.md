# IBM Bob Usage Documentation — WHERE TO DROP WASTE

## Overview

This document explains how IBM Bob was used throughout the development of **WHERE TO DROP WASTE** — an AI-powered waste segregation application.

IBM Bob is an AI-powered software engineering assistant. It was used as the primary development tool for the complete implementation of this project.

---

## What IBM Bob Did

### 1. Existing Project Inspection

IBM Bob performed a complete inspection of the existing project before making any changes:

- Read and analyzed all source files:
  - `backend/src/app.js` — Express app setup
  - `backend/src/services/classifier.js` — existing classification service
  - `backend/src/routes/classify.js` — classification routes
  - `backend/src/database/db.js` and `seed.js` — database layer
  - All 10 frontend pages and components
  - `backend/package.json` and `frontend/package.json` — dependency analysis
  - All existing docs (`README.md`, `docs/*.md`)
  - All existing tests (`__tests__/*.test.js`)

- Confirmed: **No YOLO / Ultralytics** dependencies anywhere in the project
- Confirmed: **SQL.js / SQLite** is the only database (no MongoDB)
- Confirmed: **React + Vite + Tailwind CSS** as the frontend stack (unchanged)
- Identified: The `IBMWatsonxClassifier` stub to replace with TensorFlow

---

### 2. YOLO Removal Verification

IBM Bob searched the entire codebase for YOLO/Ultralytics references:
- `grep` search for "yolo", "ultralytics", "YOLO", "Ultralytics"
- Confirmed: **zero matches** — YOLO was never present in this codebase

---

### 3. TensorFlow / Teachable Machine Integration

IBM Bob designed and implemented the complete TF integration as a modular vision service.

**Environment discovery (critical):**

IBM Bob first attempted to use `@tensorflow/tfjs-node` (native Node.js bindings) but discovered:
- Node.js v24.11.1 uses NAPI v8, but `@tensorflow/tfjs-node` prebuilt binaries only support up to NAPI v4
- VS Build Tools are not installed — source compilation is impossible
- `@tensorflow/tfjs-tflite` fails in Node.js (requires browser globals)
- Python 3.14 (default) has no TensorFlow wheels

IBM Bob then discovered Python 3.10 is installed with TensorFlow 2.20 already available.

**Solution: Python subprocess inference**

IBM Bob created a Python-based TFLite inference bridge:

**Files created:**
- [`backend/src/services/vision/tensorflowLiteService.js`](../backend/src/services/vision/tensorflowLiteService.js)
  - Spawns Python 3.10 child process for actual TFLite inference
  - Writes image to temp file, passes to Python, reads JSON result
  - Detects Python automatically across platforms
  - Graceful model-unavailable handling
  - Labels loaded from `labels.txt` (never hard-coded)

- [`backend/src/services/vision/tflite_infer.py`](../backend/src/services/vision/tflite_infer.py)
  - Python 3.10 inference script using `tf.lite.Interpreter`
  - PIL-based image preprocessing: resize → normalize → float32
  - Handles both quantized (uint8) and unquantized (float32) models
  - Returns JSON to stdout, all warnings/logs to stderr only

- [`backend/src/services/vision/preprocessing.js`](../backend/src/services/vision/preprocessing.js)
  - Magic bytes validation (JPEG, PNG, WebP, GIF)
  - File size and path safety checks

- [`backend/src/services/vision/wasteCategoryMapping.js`](../backend/src/services/vision/wasteCategoryMapping.js)
  - 80+ label → category mappings
  - Keyword inference fallback
  - All 10 canonical waste categories

- [`backend/src/services/vision/classificationPipeline.js`](../backend/src/services/vision/classificationPipeline.js)
  - Single entry point for image classification
  - Orchestrates: validation → TF inference → confidence check → category mapping

- [`backend/models/teachable_machine/README.md`](../backend/models/teachable_machine/README.md)
  - Complete setup instructions for placing model files

**Verified inference results (tested by IBM Bob):**
- Real uploaded `.webp` image: `bottle = 99.5% confidence` ✅
- Synthetic green JPEG: `harsha = 69.2%, bottle = 30.8%` ✅

---

### 4. Database Schema Updates

IBM Bob updated the SQLite schema in `db.js` to add:
- `training_candidates` table — stores user corrections with predicted/corrected class, image path, confidence, admin review status
- `admin_users` table — controls admin access

---

### 5. Backend API Development

IBM Bob rewrote `backend/src/routes/classify.js` to:
- Integrate the TF pipeline for image classification
- Handle confidence threshold logic (configurable via env var)
- Return proper "model unavailable" messages (no fake predictions)
- Add `POST /classify/correct` endpoint for user corrections → training candidates
- Add `GET /classify/model-status` endpoint
- Preserve all existing `/text`, `/confirm`, `/history` functionality

IBM Bob created new route files:
- [`backend/src/routes/admin.js`](../backend/src/routes/admin.js)
  - Admin middleware (checks admin_users table)
  - Training candidate review workflow
  - User corrections review
  - Approved dataset download
  - Model status

- [`backend/src/routes/locations.js`](../backend/src/routes/locations.js)
  - India states/UTs API
  - India cities by state API
  - Reverse geocoding via Nominatim

---

### 6. India Location Data

IBM Bob created [`backend/data/india_locations.json`](../backend/data/india_locations.json) with:
- All 28 Indian states
- All 8 Union Territories
- Multiple cities per state/UT
- Correct type labeling ("state" vs "union_territory")

Verified in tests: exactly 36 entries (28 + 8).

---

### 7. Camera Implementation

IBM Bob created [`frontend/src/components/CameraCapture.jsx`](../frontend/src/components/CameraCapture.jsx):
- `navigator.mediaDevices.getUserMedia()` integration
- `environment` (rear) / `user` (front) camera selection
- Live video preview with canvas capture
- Flip camera button
- Retake functionality
- Graceful error handling for:
  - Permission denied (NotAllowedError)
  - No camera found (NotFoundError)
  - Camera in use (NotReadableError)
  - OverconstrainedError with fallback
  - Unsupported browser
- All media tracks stopped on component close

---

### 8. Location Selector Component

IBM Bob created [`frontend/src/components/LocationSelector.jsx`](../frontend/src/components/LocationSelector.jsx):
- Loads India states from `/api/locations/india/states`
- Dependent city dropdown via `/api/locations/india/cities`
- "Use My Location" button with browser geolocation
- Reverse geocoding via `/api/locations/reverse-geocode`
- Graceful permission denial handling
- Fallback to manual selection on location failure

---

### 9. Classify Page Integration

IBM Bob updated [`frontend/src/pages/Classify.jsx`](../frontend/src/pages/Classify.jsx):
- Replaced inline INDIA_STATES/INDIA_CITIES data with `LocationSelector` component
- Added `CameraCapture` component integration
- Added Upload / Camera selection UI (two-button grid)
- Camera captures sent to same `/classify/image` API endpoint
- TF-aware result display:
  - Shows confidence with color coding
  - Shows "Unable to identify" for low confidence
  - Shows correction form for unknown objects
  - Stores corrections via `/classify/correct`
- Preserved all existing result cards (bins, instructions, rules, impact, tips, confirm)
- No UI redesign — same card layout, colors, and structure

---

### 10. Testing

IBM Bob wrote new tests and updated existing tests:
- 17 new tests added covering:
  - TF WasteCategoryMapping (8 tests)
  - TF Model Status (2 tests)
  - Image Preprocessing (5 tests)
  - India Locations Data (7 tests)
  - New API endpoints (model-status, correct, locations routes)
- All 66 tests pass

---

### 11. Branding Update

IBM Bob updated the project name everywhere:
- `frontend/index.html` — page title
- `frontend/src/components/Layout.jsx` — navigation header and footer
- `frontend/src/pages/Classify.jsx` — confirmation message
- `README.md` — complete project documentation

---

### 12. Documentation

IBM Bob wrote or updated:
- `README.md` — complete rewrite with new features
- `docs/ARCHITECTURE.md` — updated with TF pipeline, training data flow, security
- `docs/API.md` — all new endpoints documented
- `docs/ML_PIPELINE.md` — new file covering TF integration, preprocessing, training data pipeline
- `docs/SETUP.md` — updated with TF model setup, admin setup, camera/location troubleshooting
- `docs/IBM_BOB_USAGE.md` — this file

---

## What IBM Bob Did NOT Change

To comply with the requirement to preserve the existing UI and features:

- ✅ Did NOT redesign any page
- ✅ Did NOT change the color scheme (eco-green / Tailwind CSS unchanged)
- ✅ Did NOT replace React, Vite, or Tailwind CSS
- ✅ Did NOT replace SQL.js with MongoDB or any cloud database
- ✅ Did NOT remove any existing working features
- ✅ Did NOT change the navigation structure
- ✅ Did NOT add YOLO
- ✅ Did NOT add IBM watsonx (removed the stub references)
- ✅ Did NOT add unnecessary dependencies

---

## Key Engineering Decisions

| Decision | Rationale |
|----------|-----------|
| Python subprocess for TFLite inference | @tensorflow/tfjs-node requires NAPI v4, unavailable in Node v24. Python 3.10 + TF 2.20 already installed. |
| TF model loads async at app startup | Non-blocking; app works without model |
| Python writes JSON to stdout, not file | Simplest IPC; no temp files needed for result exchange |
| `sharp` for image → JPEG conversion | Handles all formats (WebP, PNG, GIF, JPEG) uniformly; Python PIL handles the JPEG |
| Model files in repo | At ~2MB the TFLite model is small enough to commit; makes setup trivial |
| Nominatim for reverse geocoding | Free, no API key, no user data stored at third party |
| India locations in JSON file | Centralized, not scattered across UI components |
| `training_candidates` separate from `user_corrections` | Allows admin workflow with richer metadata |
| Confidence threshold via env var | Configurable without code changes |
| Camera uses same `/classify/image` endpoint | Single backend classification pipeline |

---

## IBM Bob Tool Usage Summary

| Tool | Usage |
|------|-------|
| `read_file` | Read all existing files before changes |
| `grep` | Search for YOLO/Ultralytics references (confirmed zero) |
| `list_files` | Explore project structure |
| `write_file` | Create new files (vision services, location data, components) |
| `apply_diff` | Targeted edits to existing files |
| `execute_command` | `npm install`, `npm test` |
| `update_todo_list` | Track 14 implementation tasks |

---

*IBM Bob was used as the primary software engineering assistant for the complete v2.0 implementation of WHERE TO DROP WASTE.*
