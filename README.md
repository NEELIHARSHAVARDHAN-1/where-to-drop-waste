# WHERE TO DROP WASTE

> AI-powered waste segregation assistant — tells you exactly where to drop your waste, with camera-based image classification powered by TensorFlow / Google Teachable Machine, location-aware recycling rules for all Indian states and UTs, and a full gamified user experience.

---

## 🌍 Problem Statement

People want to recycle but often don't know which category an item belongs to, which bin to use, or what their local rules are. **WHERE TO DROP WASTE** makes waste segregation simple, personalized, educational, and motivating — with AI-powered camera classification and location-specific guidance for all 36 Indian states and Union Territories.

---

## Contributors


---

## ✅ Implemented Features

| Feature | Status |
|---------|--------|
| **TensorFlow / Teachable Machine image classification** | ✅ |
| Camera capture (getUserMedia, flip camera, retake) | ✅ |
| File upload classification | ✅ |
| Text-based classification (keyword + alias matching) | ✅ |
| Confidence threshold handling (default 70%) | ✅ |
| Unknown object handling + user correction | ✅ |
| Training candidate pipeline for future model improvement | ✅ |
| Admin review workflow for training candidates | ✅ |
| India location data — all 28 states + 8 UTs + cities | ✅ |
| Automatic location detection (Geolocation API + reverse geocoding) | ✅ |
| Location-based recycling rules | ✅ (sample data) |
| Cascade rules: city → state → country → general | ✅ |
| User Registration & Authentication | ✅ |
| Onboarding with quiz | ✅ |
| Sustainability Dashboard | ✅ |
| Environmental Impact Tracking | ✅ |
| Points & Gamification | ✅ |
| Levels & Badges | ✅ |
| Streaks | ✅ |
| Leaderboard | ✅ |
| Community Challenges | ✅ |
| Eco tips & Facts | ✅ |
| Circular Economy Section | ✅ |
| User Corrections (training data feedback loop) | ✅ |
| 10 waste categories | ✅ |
| Classification history | ✅ |
| No YOLO / No Ultralytics | ✅ (confirmed) |
| No MongoDB / No cloud DB | ✅ (SQL.js / SQLite) |

---

## 🏗️ Architecture

```
WHERE TO DROP WASTE
├── backend/                          Node.js + Express API
│   ├── src/
│   │   ├── app.js                    Express app setup
│   │   ├── server.js                 Server entry point
│   │   ├── database/
│   │   │   ├── db.js                 sql.js database layer
│   │   │   └── seed.js               Demo data seed
│   │   ├── routes/
│   │   │   ├── auth.js               Registration, login, profile
│   │   │   ├── classify.js           Text + image + TF classification
│   │   │   ├── rules.js              Localized recycling rules
│   │   │   ├── dashboard.js          User dashboard data
│   │   │   ├── impact.js             Environmental impact
│   │   │   ├── gamification.js       Points, badges
│   │   │   ├── challenges.js         Community challenges
│   │   │   ├── leaderboard.js        Rankings
│   │   │   ├── tips.js               Eco tips
│   │   │   ├── wasteItems.js         Waste item catalog
│   │   │   ├── locations.js          India states/cities + reverse geocode
│   │   │   └── admin.js              Admin: training candidates review
│   │   └── services/
│   │       ├── classifier.js         Text classifier (keyword + alias)
│   │       ├── impactService.js      Environmental calculations
│   │       ├── gamificationService.js  Points, levels, badges
│   │       └── vision/               ◀ TF/Teachable Machine module
│   │           ├── tensorflowService.js    Model loader + inference
│   │           ├── preprocessing.js         Image validation + reading
│   │           ├── wasteCategoryMapping.js  TF label → waste category
│   │           └── classificationPipeline.js  Full pipeline orchestrator
│   ├── data/
│   │   ├── waste_app.db              SQLite database (auto-created)
│   │   └── india_locations.json      ◀ All 36 India states/UTs + cities
│   ├── models/
│   │   └── teachable_machine/        ◀ Place your TF model files here
│   │       └── README.md             Model setup instructions
│   └── uploads/                      Uploaded images
└── frontend/                         React + Vite + Tailwind CSS
    └── src/
        ├── pages/                    All 10 pages
        ├── components/
        │   ├── Layout.jsx            App layout + navigation
        │   ├── CameraCapture.jsx     ◀ Camera component (flip, capture, retake)
        │   └── LocationSelector.jsx  ◀ Location selector (India + geolocation)
        ├── context/                  AuthContext
        └── services/                 API client
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Lucide Icons |
| Backend | Node.js, Express |
| Database | sql.js (SQLite in pure JavaScript — no native compilation required) |
| Authentication | JWT (JSON Web Tokens), bcrypt password hashing |
| AI Classification | **TensorFlow.js / TFLite** (Teachable Machine) + text classifier fallback |
| Image Upload | Multer |
| Camera | browser `navigator.mediaDevices.getUserMedia()` |
| Geolocation | browser `navigator.geolocation` + Nominatim reverse geocoding |
| India Location Data | Centralized `backend/data/india_locations.json` |
| Testing | Jest, Supertest |

---

## 📦 Quick Start

### Prerequisites

- Node.js v18+ (tested on v24)
- npm v9+

### 1. Backend Setup

```bash
cd waste-segregation-app/backend
cp .env.example .env
npm install
npm start
```

Backend starts on **http://localhost:4000**.

### 2. Frontend Setup

```bash
cd waste-segregation-app/frontend
cp .env.example .env
npm install
npm run dev
```

Frontend starts on **http://localhost:3000**.

### 3. TensorFlow Model (optional)

See [`backend/models/teachable_machine/README.md`](backend/models/teachable_machine/README.md).

Without the model:
- Text classification works fully
- Image upload with text hint works
- Camera capture works (sends to same API)
- A clear "model unavailable" message is shown for image-only classification
- No fake predictions are generated

---

## 🔐 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | **Change this in production!** | `dev_secret` |
| `DB_PATH` | SQLite database file path | `./data/waste_app.db` |
| `UPLOAD_DIR` | Image upload directory | `./uploads` |
| `MAX_FILE_SIZE_MB` | Max image upload size | `5` |
| `TF_MODEL_DIR` | Path to Teachable Machine model files | `./models/teachable_machine` |
| `TF_CONFIDENCE_THRESHOLD` | Minimum confidence to accept TF result | `0.70` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |

---

## 🤖 AI Classification Architecture

```
User image (upload or camera capture)
          │
          ▼
   Image Validation (magic bytes check)
          │
          ▼
   TF Model Inference (tensorflowService.js)
   ├── modelAvailable=true → run inference
   └── modelAvailable=false → skip to fallback
          │
          ▼
   Confidence Check (TF_CONFIDENCE_THRESHOLD=0.70)
   ├── confidence ≥ threshold → accept prediction
   └── confidence < threshold → "Unable to identify"
          │
          ▼
   Waste Category Mapping (wasteCategoryMapping.js)
   className → canonical waste category
          │
          ▼
   Location-based Rules
   city → state → country → general guidance
          │
          ▼
   Result + Gamification + Impact
```

### TF Model Files

Place your Google Teachable Machine model in:
```
backend/models/teachable_machine/
  model.json          ← TF.js topology
  weights.bin         ← TF.js weights
  metadata.json       ← class labels
```

### When Model is Unavailable

The application:
- Returns a clear "AI classification model is currently unavailable" message
- Does NOT generate fake predictions
- Falls back to text-hint classification if a hint is provided
- Allows users to submit corrections as training candidates

---

## 📸 Camera Feature

- **"Use Camera"** button on Classify page (Image/Photo tab)
- Uses `navigator.mediaDevices.getUserMedia()`
- Default: rear camera (`environment`)
- Flip button to switch to front camera (`user`)
- Live preview → Capture → Retake or Confirm
- Captured frame sent to **same** `/api/classify/image` endpoint as file uploads
- Graceful handling of: permission denied, no camera, unsupported browser

---

## 📍 Location Feature

- All 28 Indian states + 8 Union Territories with cities
- Dependent dropdown: Country → State/UT → City
- **"Use My Location"** button uses browser geolocation + Nominatim reverse geocoding
- Location data centralized in `backend/data/india_locations.json`
- GPS coordinates not stored — used only for reverse geocoding

---

## 🔮 Future: Model Training Pipeline

Unknown/low-confidence images trigger a user correction flow:
1. User provides correct class label
2. Stored in `training_candidates` table
3. Admin reviews and approves via `/api/admin/training-candidates`
4. Approved dataset available at `/api/admin/approved-dataset`
5. Use approved images to retrain Teachable Machine model
6. Export new model → replace files in `backend/models/teachable_machine/`

The production model is **never retrained automatically** during user requests.

---

## 🗄️ Database

Uses **sql.js** — pure JavaScript SQLite. Auto-created on first run with demo data.

**Tables:** users, waste_items, classifications, impacts, badges, user_badges, challenges, user_challenges, local_rules, eco_tips, user_corrections, training_candidates, admin_users

### Demo Accounts

| Name | Email | Password |
|------|-------|----------|
| Demo User | `demo@wasteseg.app` | `Demo@123` |
| Priya Sharma | `priya@demo.com` | `Demo@123` |
| Alex Chen | `alex@demo.com` | `Demo@123` |

---

## 🧪 Testing

```bash
cd backend
npm test
```

**66 tests** covering:
- LocalTextClassifier (exact, alias, partial, keyword, unknown)
- Impact calculations
- TF WasteCategoryMapping (all labels, null handling)
- TF Model Status (graceful no-model behaviour)
- Image preprocessing (JPEG/PNG magic bytes validation)
- India Locations Data (36 states/UTs, cities)
- Authentication API
- Classification API (text, confirm, correct → training candidate)
- TF model status endpoint
- Locations API (states, cities, validation)
- Rules API
- Leaderboard, Tips, Waste Items, Challenges

---

## 📡 API Quick Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/classify/text` | Optional | Classify by text |
| POST | `/classify/image` | Optional | Classify by image (TF pipeline) |
| POST | `/classify/correct` | Optional | Submit user correction → training candidate |
| POST | `/classify/confirm` | Optional | Confirm/reject result |
| GET | `/classify/history` | Yes | Classification history |
| GET | `/classify/model-status` | No | TF model availability |
| GET | `/locations/india` | No | Full India states/UTs/cities |
| GET | `/locations/india/states` | No | India states list |
| GET | `/locations/india/cities?state=X` | No | Cities for a state |
| GET | `/locations/reverse-geocode?lat=X&lon=Y` | No | Reverse geocode |
| GET | `/admin/training-candidates` | Admin | View training candidates |
| POST | `/admin/training-candidates/:id/review` | Admin | Approve/reject candidate |
| GET | `/admin/approved-dataset` | Admin | Download approved dataset |
| GET | `/admin/stats` | Admin | Admin dashboard |

---

## ⚠️ Known Limitations

1. **TF model not included** — must be trained and exported from Teachable Machine
2. **Local recycling rules** are sample data — do not present as official municipal rules
3. **sql.js** keeps DB in memory — suitable for MVP/demo
4. Environmental impact values are estimates

---

*WHERE TO DROP WASTE — Making recycling simple, personalized, and impactful.*
*Built with IBM Bob.*
