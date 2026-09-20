# Appwrite Setup & Architecture Guide

This guide documents the complete setup process for configuring **Appwrite Cloud** (or self-hosted Appwrite) as the persistent backend, authentication provider, database, and storage engine for **WHERE TO DROP WASTE**.

---

## Quick Start (Automated Setup)

If you already have an Appwrite Project and Server API key:

1. Add your credentials to `backend/.env`:
   ```env
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=your_project_id
   APPWRITE_API_KEY=your_server_api_key
   APPWRITE_DATABASE_ID=waste_segregation_db
   APPWRITE_STORAGE_BUCKET_ID=waste_images
   ```

2. Run the automated schema provisioning & seed script:
   ```bash
   cd backend
   npm run appwrite:setup
   ```

This will automatically create the database, all 13 collections, required attributes, indexes, permissions, storage bucket, and seed initial waste items, badges, challenges, local rules, and tips.

---

## Manual Setup Walkthrough

### 1. Create Appwrite Project
1. Log in to [Appwrite Cloud](https://cloud.appwrite.io) or your self-hosted console.
2. Click **Create Project**.
3. Name: `Where To Drop Waste`
4. Note your **Project ID**.

### 2. Create Web Platform
1. In your project dashboard, navigate to **Overview** -> **Add Platform** -> **Web App**.
2. **Name:** `Where To Drop Waste Web`
3. **Hostname:**
   - Local: `localhost`
   - Production: `*.vercel.app` and your custom production domain (e.g. `wheretodropwaste.com`).

### 3. Configure Domain
1. Under **Settings** -> **Custom Domains**, optionally link your production domain.
2. In the Web Platform settings, ensure all deployment domains are added to allowed hostnames to avoid CORS / session restrictions.

### 4. Create Database
1. Navigate to **Databases** -> **Create Database**.
2. **Database ID:** `waste_segregation_db` (or custom ID matching `APPWRITE_DATABASE_ID`).
3. **Name:** `Where To Drop Waste DB`.

### 5. Create Collections
Create the following 13 collections under your database:

| Collection ID | Name | Description |
|---|---|---|
| `profiles` | User Profiles | User profile, location, points, level, streak, score |
| `classifications` | Classifications | Waste classification records & prediction results |
| `impacts` | Environmental Impacts | CO2, water, and energy savings per user |
| `badges` | Badges | Available achievement badges |
| `user_badges` | User Earned Badges | Junction collection of badges earned by users |
| `challenges` | Challenges | Community and individual waste challenges |
| `user_challenges` | User Challenge Progress | User challenge enrollment & completion status |
| `local_rules` | Local Rules | Municipal waste rules by country, state, and city |
| `eco_tips` | Eco Tips | Sustainability tips, daily advice, and eco facts |
| `waste_items` | Waste Items | Waste dictionary, categories, and bin instructions |
| `user_corrections` | User Corrections | Community corrections for classifications |
| `training_candidates` | Training Candidates | AI retraining candidates flagged for review |
| `admin_users` | Admin Users | Authorized administrators |

### 6. Create Attributes

#### `profiles`
- `user_id` (String, 100, Required)
- `name` (String, 150)
- `email` (String, 255)
- `location_country` (String, 100, Default: "India")
- `location_state` (String, 100)
- `location_city` (String, 100)
- `user_type` (String, 50, Default: "household")
- `points` (Integer, Default: 0)
- `level` (Integer, Default: 1)
- `recycling_score` (Float, Default: 0)
- `streak_days` (Integer, Default: 0)
- `last_activity_date` (String, 50)
- `created_at` (String, 50)
- `updated_at` (String, 50)

#### `classifications`
- `user_id` (String, 100)
- `input_text` (String, 500)
- `image_file_id` (String, 255)
- `method` (String, 50, Required)
- `matched_item_id` (String, 100)
- `category` (String, 100, Required)
- `recyclable` (String, 50, Required)
- `disposal_method` (String, 1000)
- `confidence` (Float, Default: 0)
- `user_confirmed` (Boolean, Default: false)
- `user_correction` (String, 255)
- `points_awarded` (Integer, Default: 0)
- `timestamp` (String, 50, Required)

#### `impacts`
- `user_id` (String, 100, Required)
- `classification_id` (String, 100)
- `waste_category` (String, 100, Required)
- `weight_grams` (Float, Default: 50)
- `co2_saved_grams` (Float, Default: 0)
- `water_saved_ml` (Float, Default: 0)
- `energy_saved_wh` (Float, Default: 0)
- `timestamp` (String, 50, Required)

#### `waste_items`
- `name` (String, 150, Required)
- `aliases` (String, 500, Default: "[]")
- `category` (String, 100, Required)
- `recyclable` (String, 50, Required)
- `bin_color` (String, 50, Default: "grey")
- `bin_label` (String, 150, Default: "General Waste")
- `disposal_method` (String, 1000, Required)
- `preparation_instructions` (String, 1000)
- `sustainability_info` (String, 1000)
- `estimated_weight_grams` (Float, Default: 50)
- `co2_factor` (Float, Default: 0)
- `water_factor` (Float, Default: 0)
- `energy_factor` (Float, Default: 0)

#### `local_rules`
- `country` (String, 100, Required)
- `state` (String, 100)
- `city` (String, 100)
- `category` (String, 100, Required)
- `bin_label` (String, 150, Required)
- `bin_color` (String, 50, Default: "grey")
- `collection_schedule` (String, 255)
- `special_instructions` (String, 1000)
- `accepted_items` (String, 1000)
- `rejected_items` (String, 1000)
- `notes` (String, 1000)
- `data_source` (String, 100, Default: "sample_data")
- `verified` (Boolean, Default: false)

### 7. Create Indexes
- `profiles`: Key on `user_id`, Key on `points` (DESC)
- `classifications`: Key on `user_id`, Key on `timestamp` (DESC)
- `impacts`: Key on `user_id`, Key on `timestamp` (DESC)
- `badges`: Key on `criteria_value` (ASC)
- `user_badges`: Key on `user_id`
- `user_challenges`: Key on `user_id`, Key on `challenge_id`
- `local_rules`: Key on `country`, Key on `category`
- `waste_items`: Key on `category`
- `training_candidates`: Key on `admin_reviewed`
- `admin_users`: Unique on `user_id`

### 8. Configure Permissions
- **Public Reference Collections** (`badges`, `challenges`, `local_rules`, `eco_tips`, `waste_items`):
  - Read: `Any`
- **User Activity Collections** (`profiles`, `classifications`, `impacts`, `user_badges`, `user_challenges`, `user_corrections`):
  - Read: `Any` (or `Users`)
  - Create: `Users`
  - Update: `Users`
- **Admin Collections** (`admin_users`, `training_candidates`):
  - Read: `Users`
  - Create/Update: `Users` (verified server-side by backend `adminMiddleware`)

### 9. Create Storage Bucket
1. Navigate to **Storage** -> **Create Bucket**.
2. **Bucket ID:** `waste_images` (matching `APPWRITE_STORAGE_BUCKET_ID`).
3. **Name:** `Waste Images Bucket`.
4. **Max File Size:** `5MB` (5242880 bytes).
5. **Allowed File Extensions:** `jpg, jpeg, png, webp, gif`.

### 10. Configure Storage Permissions
- Read: `Any`
- Create: `Users` (or `Any` for guest camera captures)
- Update: `Users`
- Delete: `Users`

### 11. Create Server API Key
1. Navigate to **Overview** -> **API Keys** -> **Create API Key**.
2. **Name:** `Waste App Server API Key`.
3. **Expiration:** Select appropriate duration (e.g. 1 year or custom).
4. **Scopes:**
   - `users.read`, `users.write`
   - `databases.read`, `databases.write`
   - `collections.read`, `collections.write`
   - `documents.read`, `documents.write`
   - `files.read`, `files.write`
   - `buckets.read`, `buckets.write`
5. Save the generated key into `APPWRITE_API_KEY` in `backend/.env`.
6. **NEVER** expose this key to the frontend or git.

### 12. Configure Environment Variables

#### Backend (`backend/.env` and Vercel Backend Environment Variables)
```env
PORT=4000
NODE_ENV=production
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_appwrite_project_id
APPWRITE_API_KEY=your_appwrite_server_api_key
APPWRITE_DATABASE_ID=waste_segregation_db
APPWRITE_STORAGE_BUCKET_ID=waste_images
FRONTEND_URL=https://your-frontend.vercel.app
```

#### Frontend (`frontend/.env` and Vercel Frontend Environment Variables)
```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_appwrite_project_id
VITE_API_URL=https://your-backend.vercel.app
```

### 13. Local Development Workflow
- Run backend: `cd backend && npm run dev` (starts on port 4000).
- Run frontend: `cd frontend && npm run dev` (starts on port 3000/5173).
- If Appwrite environment variables are absent, the application automatically runs in local SQLite fallback mode with full mock features.

### 14. Vercel Deployment

#### Deploying Backend
1. Connect your repository to Vercel.
2. Root Directory: `waste-segregation-app`
3. The root `vercel.json` automatically builds the frontend static assets and provisions `backend/api/index.js` as an Express serverless function under `/api/*`.
4. Set backend environment variables (`APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, etc.) in Vercel Project Settings.

### 15. GitHub Security Checklist
- [x] `.env` and `.env.*` are ignored in `.gitignore`.
- [x] `.env.example` files contain placeholder values only.
- [x] No `APPWRITE_API_KEY` or JWT secret exists in git history.
- [x] Public frontend code uses only `VITE_APPWRITE_PROJECT_ID` and `VITE_APPWRITE_ENDPOINT`.
