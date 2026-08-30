# ML Pipeline Documentation — WHERE TO DROP WASTE

## Overview

The AI image classification in WHERE TO DROP WASTE uses a **Google Teachable Machine** model in TFLite format (`.tflite`). Inference is performed by a Python 3.10 subprocess using `tensorflow.lite.Interpreter`. The Node.js backend spawns the Python process per-request and reads the JSON result from stdout.

**No YOLO. No Ultralytics. No cloud AI service required.**

---

## Model in Use

| Property | Value |
|----------|-------|
| File | `model_unquant.tflite` |
| Labels | `labels.txt` |
| Format | TFLite FlatBuffer (TFL3) |
| Architecture | MobileNetV2 (Teachable Machine) |
| Input shape | `[1, 224, 224, 3]` — float32 |
| Output shape | `[1, N]` — softmax probabilities |
| Quantized | No (UNQUANTIZED float32) |
| Size | 2,090,332 bytes |
| Current classes | `0=harsha`, `1=bottle` |
| Inference backend | Python 3.10 + TensorFlow 2.20 |

---

## Model Files Location

```
backend/models/teachable_machine/
    model_unquant.tflite    ← TFLite model (REQUIRED)
    labels.txt              ← Class labels in index order (REQUIRED)
    README.md               ← Setup instructions
```

### labels.txt Format (Teachable Machine standard)

```
0 harsha
1 bottle
```

---

## Inference Architecture

```
Node.js (classify.js)
        │
        ▼
classificationPipeline.js
        │
        ▼
tensorflowLiteService.js
        │  spawns child process
        ▼
tflite_infer.py  (Python 3.10)
        │  tf.lite.Interpreter
        ▼
model_unquant.tflite
        │
        ▼
JSON result → stdout → Node.js
```

The Python script:
1. Accepts: `<model_path> <labels_path> <image_path>`
2. Loads TFLite model with `tf.lite.Interpreter`
3. Preprocesses the image: resize → 224×224 → float32 → normalize ÷255
4. Runs `interpreter.invoke()`
5. Returns JSON to stdout: `{"success": true, "className": "...", "confidence": 0.99, ...}`

---

## Preprocessing

1. Node.js receives image buffer (JPEG/PNG/WebP/GIF)
2. `sharp` converts it to JPEG (handles all formats consistently)
3. Written to a temp file in `os.tmpdir()`
4. Python opens the JPEG with `PIL.Image`
5. Resizes to 224×224 using `Image.BILINEAR`
6. Normalizes to `[0.0, 1.0]` (divide by 255.0 for float32 unquantized model)
7. Runs inference
8. Temp file is deleted after inference

---

## Confidence Threshold

Default: **0.70 (70%)**

Configure via: `TF_CONFIDENCE_THRESHOLD=0.80` in `backend/.env`

| Confidence | Behaviour |
|------------|-----------|
| ≥ threshold | Accept classification, show result |
| < threshold | "Unable to confidently identify this item" |
| model error | "AI classification model is currently unavailable" |

---

## Label → Category Mapping

The mapping is in [`backend/src/services/vision/wasteCategoryMapping.js`](../backend/src/services/vision/wasteCategoryMapping.js).

```javascript
LABEL_TO_CATEGORY = {
  'plastic_bottle': 'Plastic',
  'cardboard_box': 'Paper/Cardboard',
  'glass_bottle': 'Glass',
  'aluminium_can': 'Metal',
  'food_waste': 'Organic/Wet Waste',
  'mobile_phone': 'E-waste',
  'bottle': 'Plastic',     // ← matches current model label
  ...
}
```

**Update this map to match your specific Teachable Machine class names.**

If a label isn't in the map, keyword inference is used as fallback (e.g. "plastic" → Plastic).

---

## Waste Categories

The application uses exactly these canonical categories:

| Category | Recyclable |
|----------|-----------|
| Plastic | Conditional |
| Paper/Cardboard | Yes |
| Glass | Yes |
| Metal | Yes |
| Organic/Wet Waste | Yes (compost) |
| E-waste | Yes (special) |
| Hazardous Waste | No (special disposal) |
| Textile | Yes (donation/recycle) |
| Sanitary Waste | No |
| Non-recyclable/General Waste | No |

---

## Training Teachable Machine

### Recommended Class Setup

Create one class per waste type:

```
Class 0: plastic_bottle
Class 1: cardboard_box
Class 2: glass_bottle
Class 3: aluminium_can
Class 4: food_waste
Class 5: mobile_phone
Class 6: (add more as needed)
```

### Training Tips

- Minimum 50–100 images per class
- Varied lighting, angles, backgrounds
- Include the actual objects users will photograph
- Use the webcam capture feature in Teachable Machine
- Train for at least 50 epochs with default settings

### Export

1. Click **Export Model**
2. Choose **TensorFlow Lite** → **Download**
3. Extract the ZIP — get `model_unquant.tflite` and `labels.txt`
4. Copy both files to `backend/models/teachable_machine/`
5. Restart the backend server

---

## Future Training Data Pipeline

```
1. User classifies image → low confidence or unknown
       │
       ▼
2. User provides correction
   POST /api/classify/correct
   { classification_id, corrected_class }
       │
       ▼
3. Stored in training_candidates table
   { image_path, predicted_class, corrected_class, waste_category, user_id }
       │
       ▼
4. Admin reviews corrections
   GET /api/admin/training-candidates?status=pending
       │
       ▼
5. Admin approves
   POST /api/admin/training-candidates/:id/review
   { approved: true }
       │
       ▼
6. Download approved dataset
   GET /api/admin/approved-dataset
       │
       ▼
7. Retrain Teachable Machine (offline)
   - Download approved images from image_path
   - Upload to teachablemachine.withgoogle.com
   - Train new model version
       │
       ▼
8. Export and deploy new model
   - Copy files to backend/models/teachable_machine/
   - Restart backend server
```

**The production model is NEVER retrained automatically during a user request.**

---

## Python Requirements

The TFLite inference uses Python 3.10 with TensorFlow 2.20:

```bash
# Check Python version
py -0   # should show 3.10 listed

# Check TensorFlow is installed
py -3.10 -c "import tensorflow; print(tensorflow.__version__)"

# Check Pillow is installed
py -3.10 -c "import PIL; print('Pillow OK')"
```

If TensorFlow is not installed:
```bash
py -3.10 -m pip install tensorflow Pillow
```

---

## Model File Sizes

| Format | Approx. Size |
|--------|-------------|
| TFLite UNQUANTIZED (`model_unquant.tflite`) | ~2 MB |
| TFLite quantized (`model.tflite`) | ~1 MB |

Both formats are supported. The service reads `model_unquant.tflite` by default.

---

## Quantization

The current model (`model_unquant.tflite`) is **UNQUANTIZED** — it uses float32 weights throughout. This is the standard Teachable Machine TFLite export for maximum accuracy.

If you have a quantized model (`model.tflite` with uint8 weights), the Python inference script handles it automatically — PIL/numpy types are adjusted based on `input_details[0]['dtype']`.
