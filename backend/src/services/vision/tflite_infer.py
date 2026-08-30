#!/usr/bin/env python3
"""
TFLite inference script for WHERE TO DROP WASTE.

Called by the Node.js tensorflowLiteService as a child process:
    py -3.10 tflite_infer.py <model_path> <labels_path> <image_path>

Output: single line of JSON to stdout.
Errors: to stderr only.
"""

import sys
import json
import os

def main():
    if len(sys.argv) < 4:
        print(json.dumps({
            "success": False,
            "error": "Usage: tflite_infer.py <model_path> <labels_path> <image_path>"
        }))
        sys.exit(1)

    model_path  = sys.argv[1]
    labels_path = sys.argv[2]
    image_path  = sys.argv[3]

    # Silence TF log spam
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

    try:
        import tensorflow as tf
    except ImportError as e:
        print(json.dumps({"success": False, "error": f"TensorFlow not installed: {e}"}))
        sys.exit(1)

    # ── Load labels ──────────────────────────────────────────────────────────
    try:
        with open(labels_path, "r", encoding="utf-8") as f:
            raw = f.read().strip().splitlines()
        labels = []
        for line in raw:
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 1)  # split on first whitespace
            if len(parts) == 2 and parts[0].isdigit():
                idx = int(parts[0])
                while len(labels) <= idx:
                    labels.append(f"class_{len(labels)}")
                labels[idx] = parts[1].strip()
            else:
                labels.append(line)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to read labels: {e}"}))
        sys.exit(1)

    # ── Load TFLite model ─────────────────────────────────────────────────────
    try:
        interpreter = tf.lite.Interpreter(model_path=model_path)
        interpreter.allocate_tensors()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to load model: {e}"}))
        sys.exit(1)

    input_details  = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    # Verify input shape
    input_shape = input_details[0]['shape']  # expected [1, 224, 224, 3]
    input_dtype = input_details[0]['dtype']
    _, H, W, C = input_shape

    # ── Load and preprocess image ─────────────────────────────────────────────
    try:
        import numpy as np
        from PIL import Image

        img = Image.open(image_path).convert("RGB")
        img = img.resize((W, H), Image.BILINEAR)
        arr = np.array(img, dtype=np.float32)

        # Normalize: unquantized model expects [0, 1]
        if input_dtype == np.float32:
            arr = arr / 255.0
        # If quantized (uint8), skip normalization
        # input_dtype == np.uint8: arr stays as uint8

        arr = arr.reshape([1, H, W, C]).astype(input_dtype)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Image preprocessing failed: {e}"}))
        sys.exit(1)

    # ── Run inference ─────────────────────────────────────────────────────────
    try:
        interpreter.set_tensor(input_details[0]['index'], arr)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]['index'])
        probs = output[0].tolist()  # convert to Python list
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Inference failed: {e}"}))
        sys.exit(1)

    # ── Build result ──────────────────────────────────────────────────────────
    num_classes = len(labels)
    probs = probs[:num_classes]

    top_idx = int(max(range(len(probs)), key=lambda i: probs[i]))
    top_conf = float(probs[top_idx])
    class_name = labels[top_idx] if top_idx < len(labels) else f"class_{top_idx}"

    all_preds = sorted(
        [{"className": labels[i] if i < len(labels) else f"class_{i}", "confidence": float(probs[i])}
         for i in range(len(probs))],
        key=lambda x: x["confidence"],
        reverse=True
    )

    result = {
        "success": True,
        "className": class_name,
        "confidence": top_conf,
        "classIndex": top_idx,
        "allPredictions": all_preds,
        "numClasses": num_classes,
        "inputShape": input_shape.tolist(),
        "modelAvailable": True
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
