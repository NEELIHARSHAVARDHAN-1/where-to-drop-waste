# WHERE TO DROP WASTE — Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | v18+ (tested v24) | `node --version` |
| npm | v9+ | `npm --version` |
| Python | 3.10 (for backend TF fallback) | `py -0` |
| TensorFlow | 2.20+ (Python 3.10) | `py -3.10 -c "import tensorflow"` |

## Quick Start (Local — no Supabase needed)

```bash
# 1. Backend
cd backend
cp .env.example .env          # edit JWT_SECRET at minimum
npm install
npm start                     # http://localhost:4000

# 2. Frontend
cd frontend
cp .env.example .env          # set VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:3000

# 3. Run tests
cd backend
npm test                      # 66 tests, all passing
```

Demo login: `demo@wasteseg.app` / `Demo@123`

---

## AI Classification Architecture

### NEW: Browser-side inference (fast)

```
User uploads image / captures with camera
         ↓
  tfliteClassifier.js (browser)
         ↓
  @tensorflow/tfjs-tflite (WASM)
         ↓
  model_unquant.tflite  ←  /public/models/
         ↓
  Instant result (no backend round-trip)
         ↓
  Backend called only to PERSIST result + award points
```

- Model loaded **once** on page open, cached in memory
- Subsequent classifications are **nearly instant**
- No Python subprocess for normal user requests

### Backend TFLite (fallback)

The backend still runs `tflite_infer.py` via Python 3.10 for:
- File upload classification when JS is unavailable
- Admin/batch processing
- Health check / model-status endpoint

---

## Supabase Setup (Production)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project.

### 2. Run SQL migrations

In the Supabase SQL Editor, run these files **in order**:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
```

### 3. Configure environment variables

**Backend `.env`:**
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY="your key"  ← from Project Settings → API → service_role
```

**Frontend `.env`:**
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY="your key"    ← from Project Settings → API → anon (public)
```

> **NEVER** put the service_role key in frontend `.env` or `VITE_` variables.

### 4. Authentication mode

With Supabase env vars set:
- Frontend uses `supabase.auth.signInWithPassword()` / `signUp()`
- Access token forwarded to backend as `Authorization: Bearer <token>`
- Backend verifies via `supabase.auth.getUser(token)` — never trusts client-side user_id

Without Supabase env vars:
- Falls back to custom JWT (`/api/auth/login` → `{ token, user }`)
- Local development works with no cloud services

### 5. Storage bucket (for image persistence)

In Supabase Storage, create a bucket named `waste-images`:
- Set to **private** (users access only their own images via RLS)
- Optional: set 5MB file size limit

---

## Vercel Deployment

### Option A — Monorepo (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project root
vercel
```

The `vercel.json` at the project root routes:
- `/api/*` → `backend/api/index.js` (serverless Node.js)
- `/*` → `frontend/dist/` (static React build)

### Option B — Separate deployments

**Frontend → Vercel:**
```bash
cd frontend
vercel
# Set VITE_API_URL to your backend URL
# Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID
```

**Backend → Vercel Serverless or Container:**
```bash
# Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
# Set APPWRITE_DATABASE_ID, APPWRITE_STORAGE_BUCKET_ID
# Set FRONTEND_URL to your Vercel frontend URL
```

### Environment variables (Appwrite & Deployment)

For detailed Appwrite setup, see [docs/APPWRITE_SETUP.md](APPWRITE_SETUP.md).

| Variable | Where | Value |
|---|---|---|
| `VITE_API_URL` | Frontend | Production backend URL |
| `VITE_APPWRITE_ENDPOINT` | Frontend | Appwrite endpoint (e.g. `https://cloud.appwrite.io/v1`) |
| `VITE_APPWRITE_PROJECT_ID` | Frontend | Public Appwrite Project ID |
| `APPWRITE_ENDPOINT` | Backend | Appwrite endpoint |
| `APPWRITE_PROJECT_ID` | Backend | Appwrite Project ID |
| `APPWRITE_API_KEY` | Backend | **Secret** — Server API key |
| `APPWRITE_DATABASE_ID` | Backend | Appwrite Database ID (`waste_segregation_db`) |
| `APPWRITE_STORAGE_BUCKET_ID` | Backend | Storage Bucket ID (`waste_images`) |
| `FRONTEND_URL` | Backend | Your Vercel frontend URL |

---

## TFLite Model

### Browser inference (primary)

Model files served as static assets:
```
frontend/public/models/
    model_unquant.tflite    ← 2 MB — served as /models/model_unquant.tflite
    labels.txt              ← 16 classes
```

### Current model labels (16 classes)

```
0  Background
1  Crumpled Paper     → Paper/Cardboard
2  Remote             → E-waste
3  HW Battery         → E-waste
4  Screw Driver       → Metal
5  Pen                → General Waste
6  Brush              → General Waste
7  Id card            → General Waste
8  Shuttlecock        → General Waste
9  Bottle             → Plastic
10 Fork or Spoon      → Metal
11 Knife              → Metal
12 Paste              → General Waste
13 Chocolate Wrapper  → General Waste
14 Tablet             → E-waste
15 Scissor            → Metal
```

### To retrain with more classes

1. Go to [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com)
2. Create Image Project → add waste classes → train
3. Export → **TensorFlow Lite** → Download
4. Replace `frontend/public/models/model_unquant.tflite` and `labels.txt`
5. Also replace `backend/models/teachable_machine/model_unquant.tflite` and `labels.txt`
6. Update `backend/src/services/vision/wasteCategoryMapping.js` with new labels

---

## Camera Requirements

- Works on: Chrome, Firefox, Safari (iOS 14.3+), Edge
- Requires HTTPS in production (localhost is exempt)
- Default camera: rear (`environment`)
- Flip button switches to front (`user`)
- Camera tracks properly cleaned up on component close

---

## Security Model

| Attack | Mitigation |
|---|---|
| Password storage | Supabase Auth handles bcrypt hashing — never plain text |
| Points manipulation | Points updated only via server-side `award_points()` RPC |
| User impersonation | user_id derived from verified Supabase access token, never trusted from client |
| Cross-user data access | Row Level Security (RLS) on all user tables |
| Secret key exposure | SERVICE_ROLE_KEY only in backend `.env`, never in VITE_ vars |
| XSS | helmet, input validation via express-validator |
| CSRF | JWT Bearer tokens (not cookies) |
| Rate abuse | express-rate-limit: 200 req/15min |
| Large uploads | multer 5MB limit + magic bytes validation |

---

## Troubleshooting

**Frontend can't connect to backend:**
```
Check VITE_API_URL in frontend/.env
Ensure FRONTEND_URL in backend/.env includes your frontend origin
```

**TF model not loading in browser:**
```
Verify frontend/public/models/ contains model_unquant.tflite and labels.txt
Check browser console for @tensorflow/tfjs-tflite WASM errors
Ensure HTTPS for camera on non-localhost
```

**Supabase auth not working:**
```
Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend .env
Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend .env
Run SQL migrations in Supabase SQL Editor
```

**Python TFLite backend fallback:**
```
py -0                                               # should list 3.10
py -3.10 -c "import tensorflow; print('OK')"        # should print OK
py -3.10 -m pip install tensorflow Pillow           # install if missing
```

**Tests failing:**
```
cd backend && npm install && npm test
Delete backend/data/test_*.db and retry
```
