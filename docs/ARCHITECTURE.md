# Architecture Documentation — WHERE TO DROP WASTE

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React/Vite)                  │
│  Pages: Home, Classify, Rules, Dashboard, Challenges,    │
│         Leaderboard, Learn, Profile, Onboarding,         │
│         Login, Register                                   │
│  Components: CameraCapture, LocationSelector             │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP / REST API
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (Express)                       │
│                                                           │
│  Routes:  /api/auth, /api/classify, /api/rules,          │
│           /api/dashboard, /api/impact,                    │
│           /api/gamification, /api/challenges,             │
│           /api/leaderboard, /api/tips, /api/waste-items,  │
│           /api/locations, /api/admin                      │
│                                                           │
│  Services:                                                │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  vision/ (TF/Teachable Machine)                     │ │
│  │  ├── tensorflowService      model loader + infer    │ │
│  │  ├── preprocessing          image validation        │ │
│  │  ├── wasteCategoryMapping   label → category        │ │
│  │  └── classificationPipeline pipeline orchestrator   │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌────────────────────┐  ┌───────────────────────────┐   │
│  │  LocalTextClassifier│  │   GamificationService     │   │
│  │  (keyword/alias)   │  │   (points, levels, badges) │  │
│  └────────────────────┘  └───────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │   ImpactService (CO₂, water, energy estimates)      │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Database (sql.js / SQLite)                   │
│  Tables: users, waste_items, classifications,             │
│          impacts, badges, user_badges, challenges,        │
│          user_challenges, local_rules, eco_tips,          │
│          user_corrections, training_candidates,           │
│          admin_users                                      │
└─────────────────────────────────────────────────────────┘
```

## Classification Flow

```
User Input (text OR image/camera capture)
         │
         ▼
┌────────────────────────────────────────────────────┐
│                 Text classification                  │
│  exact name → alias → partial → keyword inference   │
│  → unknown result                                    │
└────────────────────────────────────────────────────┘
         OR
┌────────────────────────────────────────────────────┐
│            Image classification (TF pipeline)        │
│                                                      │
│  1. Image validation (magic bytes)                   │
│  2. TensorflowService.classify(buffer)               │
│       → load model (model.json / model.tflite)       │
│       → resize to model inputSize (224×224)          │
│       → normalize [0,1]                              │
│       → model.predict()                              │
│       → softmax probabilities                        │
│  3. Confidence threshold check (default 70%)         │
│       ≥ threshold → accept                           │
│       < threshold → "Unable to identify"             │
│  4. mapLabelToCategory(className)                    │
│       TM class label → waste category                │
│  5. If model unavailable + hint provided             │
│       → LocalTextClassifier.classify(hint)           │
└────────────────────────────────────────────────────┘
         │
         ▼
  Classification Result
  {category, recyclable, bin_label, disposal_method,
   preparation_instructions, sustainability_info,
   circular_economy_tips, confidence, is_uncertain,
   classifier, match_type}
         │
         ▼
  Local Rules Overlay
  (if location provided: country + state + city)
  cascade: city rule → state rule → country rule → general
         │
         ▼
  Impact Calculation (CO₂, water, energy estimates)
         │
         ▼
  Save to DB (classifications, impacts)
         │
         ▼
  Award Points → Check Badges → Update Challenges
         │
         ▼
  Response to Client
```

## TensorFlow Model Loading

```
initializeModel()
  ├── loadMetadata() → metadata.json
  │     labels: [...], imageSize: 224
  ├── detectModelType()
  │     model.json exists → 'tfjs'
  │     model.tflite exists → 'tflite'
  │     neither → null (modelAvailable=false, no crash)
  ├── 'tfjs' → require('@tensorflow/tfjs-node')
  │            tf.loadLayersModel(file://model.json)
  └── 'tflite' → require('@tensorflow/tfjs-tflite')
                 tflite.loadTFLiteModel(file://model.tflite)
```

## Training Data Pipeline

```
Unknown/low-confidence image
        │
        ▼
User provides correction (corrected_class)
        │
        ▼
POST /api/classify/correct
  → INSERT INTO training_candidates
    {image_path, predicted_class, predicted_confidence,
     corrected_class, waste_category, user_id}
        │
        ▼
Admin reviews GET /api/admin/training-candidates
        │
        ▼
Admin approves: POST /api/admin/training-candidates/:id/review
  → admin_approved = 1
        │
        ▼
GET /api/admin/approved-dataset
  → dataset manifest for offline retraining
        │
        ▼
Retrain Teachable Machine model (offline)
        │
        ▼
Export TF.js or TFLite → place in backend/models/teachable_machine/
        │
        ▼
Restart backend → new model loaded
```

## Location Architecture

```
india_locations.json (centralized data file)
  ├── 28 states (type: "state")
  └── 8 union territories (type: "union_territory")
        each with cities[]

GET /api/locations/india/states     → state list
GET /api/locations/india/cities     → cities for a state
GET /api/locations/reverse-geocode  → lat/lon → state/city

Frontend: LocationSelector component
  Country → State/UT → City (dependent dropdowns)
  "Use My Location" → browser geolocation → reverse geocode

Location Privacy:
  - Coordinates used only for reverse geocoding
  - Only country/state/city stored in database
```

## Security Architecture

```
Authentication:
  bcrypt (salt rounds=12) → password_hash
  JWT (7d expiry) → stored in localStorage
  authMiddleware → verify JWT on protected routes
  adminMiddleware → check admin_users table

Image Security:
  - multer file filter (extension check)
  - magic bytes validation (JPEG/PNG/WebP/GIF)
  - file size limit (MAX_FILE_SIZE_MB)
  - safe filename (uuid-based)

API Security:
  - helmet (security headers)
  - cors (allowedOrigins whitelist)
  - express-rate-limit (200 req / 15 min)
  - express-validator (input sanitization)
  - no stack traces in production error responses
```
