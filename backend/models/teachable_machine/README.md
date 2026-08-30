# Teachable Machine Model Files

Place your Google Teachable Machine model files here.

## Required Files

### Option A: TensorFlow.js Export (Recommended)
```
backend/models/teachable_machine/
├── model.json          ← Model topology
├── weights.bin         ← Model weights (may be multiple shard files)
└── metadata.json       ← Class labels and input size
```

### Option B: TensorFlow Lite Export
```
backend/models/teachable_machine/
├── model.tflite        ← Compiled TFLite model
└── metadata.json       ← Class labels and input size
```

## How to Export from Teachable Machine

1. Go to https://teachablemachine.withgoogle.com/
2. Create an Image Project
3. Add classes matching the waste categories:
   - plastic_bottle
   - cardboard_box
   - glass_bottle
   - metal_can
   - food_waste
   - mobile_phone
   - (add more as needed)
4. Train the model
5. Click **Export Model**
6. Choose **TensorFlow.js** → **Download**
7. Extract the ZIP and copy files here

## metadata.json Format

The metadata.json from Teachable Machine looks like:
```json
{
  "tflite": { ... },
  "labels": ["plastic_bottle", "cardboard_box", "glass_bottle", ...],
  "imageSize": 224
}
```

## Installing TensorFlow.js for Node.js

After placing model files, install the TF backend:

```bash
cd backend
npm install @tensorflow/tfjs-node
```

For TFLite models:
```bash
npm install @tensorflow/tfjs-tflite
```

## Model Labels → Waste Category Mapping

The mapping is defined in:
`backend/src/services/vision/wasteCategoryMapping.js`

Update `LABEL_TO_CATEGORY` to match your model's exact class names.

## Confidence Threshold

Default: 0.70 (70%)

To change: set `TF_CONFIDENCE_THRESHOLD=0.80` in `backend/.env`

## Without Model Files

The application runs perfectly without model files:
- Text classification continues to work
- Image upload with text hint continues to work
- Camera capture continues to work (sends to same API)
- A clear "model unavailable" message is shown for image-only classification
- No fake predictions are generated
