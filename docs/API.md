# API Documentation — WHERE TO DROP WASTE

Base URL: `http://localhost:4000/api`

Authentication: `Authorization: Bearer <jwt_token>`

---

## Health Check

### GET /health
**Response:** `{ status: "ok", timestamp: "...", version: "2.0.0", name: "WHERE TO DROP WASTE" }`

---

## Authentication

### POST /auth/register
**Body:**
```json
{
  "name": "string (2-100 chars)",
  "email": "string (valid email)",
  "password": "string (min 6 chars)",
  "location_country": "India (optional)",
  "location_state": "Maharashtra (optional)",
  "location_city": "Mumbai (optional)",
  "user_type": "household | school | office | community (optional)"
}
```
**Response 201:** `{ token, user }`

### POST /auth/login
**Body:** `{ email, password }`
**Response 200:** `{ token, user }`

### GET /auth/me _(protected)_
**Response:** User object (no password_hash)

### PATCH /auth/profile _(protected)_
**Body:** `{ name?, location_country?, location_state?, location_city?, user_type? }`

---

## Classification

### POST /classify/text
**Body:**
```json
{
  "item": "Plastic Water Bottle",
  "country": "India (optional)",
  "state": "Maharashtra (optional)",
  "city": "Mumbai (optional)"
}
```
**Response:**
```json
{
  "found": true,
  "confidence": 0.9,
  "match_type": "exact_match",
  "classifier": "LocalTextClassifier",
  "category": "Plastic",
  "recyclable": "yes",
  "bin_label": "Dry/Recyclable Waste",
  "bin_color": "blue",
  "disposal_method": "...",
  "preparation_instructions": "...",
  "sustainability_info": "...",
  "circular_economy_tips": ["..."],
  "local_rule": { "bin_label": "...", "disclaimer": "SAMPLE DATA..." },
  "rule_note": "Verified local recycling rule unavailable. Showing general guidance.",
  "impact": { "co2_saved_grams": 45, "water_saved_ml": 5100, "energy_saved_wh": 174, "disclaimer": "..." },
  "classification_id": "uuid",
  "points_awarded": 10
}
```

### POST /classify/image
**Form Data:** `image` (file), `hint` (string, optional), `country`, `state`, `city`

**Notes:**
- Supports camera captures (Blob) and file uploads — same endpoint
- Uses TensorFlow/Teachable Machine pipeline
- Falls back to text-hint classification when model is unavailable

**Response (TF model available, high confidence):**
```json
{
  "success": true,
  "found": true,
  "confidence": 0.94,
  "tf_confidence": 0.94,
  "match_type": "tf_image_classification",
  "classifier": "TensorflowClassifier",
  "category": "Plastic",
  "item_name": "plastic_bottle",
  "tf_class": "plastic_bottle",
  "all_predictions": [
    { "className": "plastic_bottle", "confidence": 0.94 },
    { "className": "glass_bottle", "confidence": 0.04 }
  ],
  "location": { "country": "India", "state": "Maharashtra", "city": "Mumbai" },
  "classification_id": "uuid"
}
```

**Response (low confidence):**
```json
{
  "found": false,
  "confidence": 0.42,
  "match_type": "tf_below_threshold",
  "is_uncertain": true,
  "uncertainty_reason": "Unable to confidently identify this item. (Confidence: 42%, threshold: 70%)",
  "can_retry": true,
  "can_correct": true,
  "training_candidate_pending": true,
  "correction_url": "/api/classify/correct/uuid"
}
```

**Response (model unavailable):**
```json
{
  "found": false,
  "match_type": "model_unavailable",
  "is_uncertain": true,
  "uncertainty_reason": "AI classification model is currently unavailable.",
  "model_setup_note": "Place Teachable Machine model files in backend/models/teachable_machine/ to enable AI image classification."
}
```

### POST /classify/correct
**Body:**
```json
{
  "classification_id": "uuid",
  "corrected_class": "plastic_bottle",
  "corrected_category": "Plastic (optional)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Thank you! Your correction has been saved and will be reviewed by an admin for future model improvement.",
  "training_candidate_id": "uuid",
  "gamification": { "pointsEarned": 5 }
}
```

### POST /classify/confirm
**Body:**
```json
{
  "classification_id": "uuid",
  "confirmed": true,
  "correction": "optional correction text"
}
```

### GET /classify/history _(protected)_
**Query:** `?page=1&limit=20`

### GET /classify/model-status
**Response:**
```json
{
  "modelAvailable": false,
  "modelType": null,
  "labels": [],
  "inputSize": 224,
  "error": "Model metadata missing: ...",
  "setupInstructions": {
    "message": "Place your Teachable Machine model files in backend/models/teachable_machine/",
    "requiredFiles": ["model.json", "weights.bin", "metadata.json"]
  }
}
```

---

## Locations

### GET /locations/india
Full India dataset with all states/UTs and cities.

### GET /locations/india/states
Returns list of `{ name, type }` — type is "state" or "union_territory".

### GET /locations/india/cities?state=Maharashtra
Returns `{ state, type, cities: [...] }`.

**Error 400:** missing state param
**Error 404:** state not found

### GET /locations/reverse-geocode?lat=19.07&lon=72.87
Reverse geocodes coordinates to country/state/city using Nominatim.

**Response:**
```json
{
  "success": true,
  "country": "India",
  "state": "Maharashtra",
  "city": "Mumbai",
  "privacy_note": "Coordinates are used only for this reverse geocoding lookup and are not stored."
}
```

---

## Recycling Rules

### GET /rules
**Query:** `?country=India&state=Maharashtra&city=Mumbai&category=Plastic`
**Response:** `{ rules: [...], disclaimer: "SAMPLE DATA...", country, state, city }`

### GET /rules/countries
### GET /rules/states?country=India
### GET /rules/cities?country=India&state=Maharashtra

---

## Dashboard _(protected)_

### GET /dashboard
**Response:** `{ user, impact, recent_classifications, category_breakdown, active_challenges, weekly_activity }`

---

## Impact _(protected)_

### GET /impact
### GET /impact/by-category

---

## Gamification _(protected)_

### GET /gamification/profile
### GET /gamification/badges
### GET /gamification/badges/all

---

## Challenges

### GET /challenges
### GET /challenges/my _(protected)_
### GET /challenges/:id
### POST /challenges/:id/join _(protected)_

---

## Leaderboard

### GET /leaderboard
**Query:** `?limit=10`

---

## Tips

### GET /tips
**Query:** `?type=eco_fact|daily|diy&category=reduce|reuse|recycle&count=5`
### GET /tips/daily

---

## Waste Items

### GET /waste-items
**Query:** `?category=Plastic&recyclable=yes&search=bottle`
### GET /waste-items/categories
### GET /waste-items/:id

---

## Admin _(protected — admin role required)_

### POST /admin/grant
Bootstrap the first admin user. Only works when admin_users table is empty.

### GET /admin/training-candidates
**Query:** `?status=pending|approved|rejected&page=1&limit=20`

### POST /admin/training-candidates/:id/review
**Body:**
```json
{
  "approved": true,
  "notes": "Correct label confirmed",
  "corrected_class": "plastic_bottle (optional override)",
  "waste_category": "Plastic (optional override)"
}
```

### GET /admin/user-corrections
Paged list of user-submitted corrections.

### GET /admin/model-status
Current TF model status.

### GET /admin/stats
```json
{
  "total_users": 120,
  "total_classifications": 1500,
  "total_corrections": 45,
  "pending_candidates": 12,
  "approved_candidates": 33,
  "model_status": { ... }
}
```

### GET /admin/approved-dataset
Download approved training dataset manifest for offline model retraining.

---

## Error Responses

```json
{ "error": "Error message" }
{ "errors": [{ "msg": "...", "path": "..." }] }
```

HTTP status codes: 200, 201, 400, 401, 403, 404, 409, 500
