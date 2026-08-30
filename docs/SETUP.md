# Setup Guide — WHERE TO DROP WASTE

## Prerequisites

- Node.js v18 or higher (tested on v24)
- npm v9 or higher
- No native build tools required (uses sql.js pure JavaScript SQLite)

## Step-by-Step Setup

### 1. Backend

```bash
cd waste-segregation-app/backend

# Copy environment configuration
cp .env.example .env

# Edit .env — at minimum change JWT_SECRET for production
# JWT_SECRET=your_strong_random_secret_here

# Install dependencies
npm install

# Start the server
npm start
```

Verify: `http://localhost:4000/api/health` should return `{"status":"ok","name":"WHERE TO DROP WASTE"}`

On first start, the database is automatically created and seeded with demo data.

### 2. Frontend

```bash
cd waste-segregation-app/frontend

# Copy environment configuration
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit: `http://localhost:3000`

### 3. Run Tests

```bash
cd waste-segregation-app/backend
npm test
```

Expected: **66 tests passing**.

### 4. TensorFlow / Teachable Machine Model (already included)

The model files are already present in the repository:

```
backend/models/teachable_machine/
    model_unquant.tflite    ← TFLite model (2 MB)
    labels.txt              ← class labels
```

Python 3.10 and TensorFlow 2.20 are **required** to run AI inference:

```bash
# Verify Python 3.10 is installed
py -0   # should list Python 3.10

# Verify TensorFlow is installed
py -3.10 -c "import tensorflow; print(tensorflow.__version__)"
# Expected: 2.x.x

# Verify Pillow
py -3.10 -c "import PIL; print('OK')"

# If not installed:
py -3.10 -m pip install tensorflow Pillow
```

**Without Python/TF:** The application runs fully. Text classification and image-with-hint classification work. Camera capture works (uses same API). Image-only classification shows a clear "model unavailable" message without fake predictions.

**To retrain with more waste classes:**
1. Go to https://teachablemachine.withgoogle.com/
2. Create an Image Project → add classes → train
3. Export → **TensorFlow Lite** → Download
4. Replace `model_unquant.tflite` and `labels.txt` in `backend/models/teachable_machine/`
5. Restart the backend server

### 5. Admin Setup (optional)

To enable admin features for reviewing training candidates:

1. Register a user account at `http://localhost:3000/register`
2. Note your user ID from the JWT or GET /api/auth/me
3. Bootstrap admin access (only works when no admins exist yet):
   ```bash
   curl -X POST http://localhost:4000/api/admin/grant \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json"
   ```
4. Admin APIs are now accessible with your token at `/api/admin/*`

## Demo Login

After starting the app:
- **Email:** `demo@wasteseg.app`
- **Password:** `Demo@123`

Or any of the other demo accounts listed in `README.md`.

## Camera Usage

The camera feature uses browser APIs:
- Works in: Chrome, Firefox, Safari (iOS 14.3+), Edge
- Requires HTTPS in production (localhost is exempt)
- User must grant camera permission when prompted
- If denied: the file upload option still works

## Location Features

- Location dropdown loads from `/api/locations/india/states` and `/api/locations/india/cities`
- "Use My Location" requires browser geolocation permission
- Reverse geocoding uses Nominatim (OpenStreetMap) — free, no API key required

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | **Change in production** | `dev_secret_change_in_production` |
| `DB_PATH` | SQLite database file path | `./data/waste_app.db` |
| `UPLOAD_DIR` | Image upload directory | `./uploads` |
| `MAX_FILE_SIZE_MB` | Max image upload size | `5` |
| `TF_MODEL_DIR` | Path to TF model directory | `./models/teachable_machine` |
| `TF_CONFIDENCE_THRESHOLD` | Min confidence for TF classification | `0.70` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |

### Frontend (`frontend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:4000` |

## Troubleshooting

**Port already in use:**
```powershell
# Change PORT in backend/.env
PORT=4001
```

**Database issues:**
```powershell
# Delete the DB to recreate from scratch
Remove-Item .\backend\data\waste_app.db
npm start
```

**Frontend can't reach backend:**
- Check `VITE_API_URL` in `frontend/.env`
- Ensure `FRONTEND_URL` in `backend/.env` matches your frontend URL

**TF model not loading:**
- Verify Python 3.10 is installed: `py -0`
- Verify TensorFlow: `py -3.10 -c "import tensorflow; print('OK')"`
- Install if missing: `py -3.10 -m pip install tensorflow Pillow`
- Check `backend/models/teachable_machine/` contains `model_unquant.tflite` and `labels.txt`
- Check `GET http://localhost:4000/api/classify/model-status` for details

**Camera permission denied:**
- Click the lock icon in your browser's address bar → allow camera
- Or use the file upload option instead

**Tests failing:**
- Run `npm install` first
- Delete test DB files: `backend/data/test_*.db`
- Run `npm test` again
