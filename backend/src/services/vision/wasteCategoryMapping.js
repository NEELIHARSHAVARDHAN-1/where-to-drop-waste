/**
 * Waste Category Mapping
 *
 * Maps TensorFlow / Teachable Machine class labels → waste categories.
 *
 * The Teachable Machine model classifies an image into one of its trained
 * class names (e.g. "plastic_bottle", "cardboard_box"). This module maps
 * those class names to the application's canonical waste categories.
 *
 * IMPORTANT: Update this mapping to match the actual class labels in your
 * Teachable Machine model's metadata.json.
 *
 * Canonical waste categories (must match the existing application):
 *   Plastic, Paper/Cardboard, Glass, Metal, Organic/Wet Waste,
 *   E-waste, Hazardous Waste, Textile, Sanitary Waste,
 *   Non-recyclable/General Waste
 */

'use strict';

/**
 * Primary label → category map.
 * Keys are LOWER-CASE versions of the Teachable Machine class names.
 * Add or update entries to match your specific model's labels.
 */
const LABEL_TO_CATEGORY = {
  // ── Current model labels (labels.txt — 16 classes) ───────────────────────
  'background':         'Non-recyclable/General Waste',
  'crumpled paper':     'Paper/Cardboard',
  'remote':             'E-waste',
  'hw battery':         'E-waste',
  'screw driver':       'Metal',
  'pen':                'Non-recyclable/General Waste',
  'brush':              'Non-recyclable/General Waste',
  'id card':            'Non-recyclable/General Waste',
  'shuttlecock':        'Non-recyclable/General Waste',
  'bottle':             'Plastic',
  'fork or spoon':      'Metal',
  'knife':              'Metal',
  'paste':              'Non-recyclable/General Waste',
  'chocolate wrapper':  'Non-recyclable/General Waste',
  'tablet':             'E-waste',
  'scissor':            'Metal',

  // ── Plastic ───────────────────────────────────────────────────────────────
  'plastic_bottle': 'Plastic',
  'plastic bottle': 'Plastic',
  'plastic_bag': 'Plastic',
  'plastic bag': 'Plastic',
  'plastic_container': 'Plastic',
  'plastic container': 'Plastic',
  'plastic_cup': 'Plastic',
  'plastic cup': 'Plastic',
  'straw': 'Plastic',
  'plastic_straw': 'Plastic',
  'styrofoam': 'Plastic',
  'polystyrene': 'Plastic',
  'thermocol': 'Plastic',
  'plastic': 'Plastic',

  // ── Paper / Cardboard ─────────────────────────────────────────────────────
  'cardboard': 'Paper/Cardboard',
  'cardboard_box': 'Paper/Cardboard',
  'cardboard box': 'Paper/Cardboard',
  'paper': 'Paper/Cardboard',
  'newspaper': 'Paper/Cardboard',
  'magazine': 'Paper/Cardboard',
  'paper_cup': 'Paper/Cardboard',
  'paper cup': 'Paper/Cardboard',
  'book': 'Paper/Cardboard',
  'tissue': 'Sanitary Waste',
  'tissue_paper': 'Sanitary Waste',

  // ── Glass ─────────────────────────────────────────────────────────────────
  'glass_bottle': 'Glass',
  'glass bottle': 'Glass',
  'glass': 'Glass',
  'glass_jar': 'Glass',
  'glass jar': 'Glass',
  'broken_glass': 'Glass',

  // ── Metal ─────────────────────────────────────────────────────────────────
  'metal_can': 'Metal',
  'metal can': 'Metal',
  'aluminium_can': 'Metal',
  'aluminium can': 'Metal',
  'aluminum_can': 'Metal',
  'aluminum can': 'Metal',
  'steel_can': 'Metal',
  'steel can': 'Metal',
  'tin_can': 'Metal',
  'tin can': 'Metal',
  'metal': 'Metal',
  'aluminium_foil': 'Metal',
  'scrap_metal': 'Metal',

  // ── Organic / Wet Waste ───────────────────────────────────────────────────
  'food_waste': 'Organic/Wet Waste',
  'food waste': 'Organic/Wet Waste',
  'food': 'Organic/Wet Waste',
  'vegetable': 'Organic/Wet Waste',
  'fruit': 'Organic/Wet Waste',
  'fruit_peel': 'Organic/Wet Waste',
  'vegetable_peel': 'Organic/Wet Waste',
  'organic_waste': 'Organic/Wet Waste',
  'organic waste': 'Organic/Wet Waste',
  'garden_waste': 'Organic/Wet Waste',
  'cooked_food': 'Organic/Wet Waste',

  // ── E-waste ───────────────────────────────────────────────────────────────
  'mobile_phone': 'E-waste',
  'mobile phone': 'E-waste',
  'phone': 'E-waste',
  'smartphone': 'E-waste',
  'laptop': 'E-waste',
  'computer': 'E-waste',
  'battery': 'E-waste',
  'charger': 'E-waste',
  'cable': 'E-waste',
  'television': 'E-waste',
  'tv': 'E-waste',
  'monitor': 'E-waste',
  'electronic': 'E-waste',
  'electronics': 'E-waste',
  'fluorescent_bulb': 'E-waste',
  'cfl_bulb': 'E-waste',

  // ── Hazardous ─────────────────────────────────────────────────────────────
  'paint_can': 'Hazardous Waste',
  'paint can': 'Hazardous Waste',
  'chemical': 'Hazardous Waste',
  'medicine': 'Hazardous Waste',
  'pesticide': 'Hazardous Waste',
  'motor_oil': 'Hazardous Waste',
  'hazardous': 'Hazardous Waste',

  // ── Textile ───────────────────────────────────────────────────────────────
  'clothing': 'Textile',
  'clothes': 'Textile',
  'fabric': 'Textile',
  'textile': 'Textile',
  'shoes': 'Textile',
  'footwear': 'Textile',

  // ── Sanitary ──────────────────────────────────────────────────────────────
  'diaper': 'Sanitary Waste',
  'sanitary_pad': 'Sanitary Waste',
  'sanitary pad': 'Sanitary Waste',
  'sanitary': 'Sanitary Waste',

  // ── General / Non-recyclable ──────────────────────────────────────────────
  'chip_packet': 'Non-recyclable/General Waste',
  'snack_wrapper': 'Non-recyclable/General Waste',
  'ceramic': 'Non-recyclable/General Waste',
  'general_waste': 'Non-recyclable/General Waste',
  'general waste': 'Non-recyclable/General Waste',
  'mixed_waste': 'Non-recyclable/General Waste',
};

/**
 * Maps a TF class label to a canonical waste category.
 *
 * @param {string} className - Label from the TF model
 * @returns {string} Waste category name
 */
function mapLabelToCategory(className) {
  if (!className) return 'Unknown';
  const key = className.toLowerCase().trim();
  return LABEL_TO_CATEGORY[key] || inferCategoryFromLabel(key);
}

/**
 * Fallback: try to infer category from keyword presence in the label.
 */
function inferCategoryFromLabel(label) {
  const keywords = [
    { words: ['plastic', 'poly', 'pet', 'hdpe', 'pvc'], category: 'Plastic' },
    { words: ['paper', 'cardboard', 'card', 'newspaper', 'magazine', 'book'], category: 'Paper/Cardboard' },
    { words: ['glass', 'bottle', 'jar'], category: 'Glass' },
    { words: ['metal', 'can', 'alumin', 'steel', 'iron', 'copper', 'tin', 'foil'], category: 'Metal' },
    { words: ['food', 'organic', 'vegetable', 'fruit', 'compost', 'garden', 'peel'], category: 'Organic/Wet Waste' },
    { words: ['electronic', 'phone', 'laptop', 'computer', 'battery', 'cable', 'tv', 'monitor'], category: 'E-waste' },
    { words: ['chemical', 'paint', 'medicine', 'drug', 'pesticide', 'oil', 'toxic', 'hazard'], category: 'Hazardous Waste' },
    { words: ['cloth', 'textile', 'fabric', 'garment', 'shirt', 'jeans', 'shoes', 'dress'], category: 'Textile' },
    { words: ['diaper', 'sanitary', 'nappy', 'tissue', 'wipe', 'pad'], category: 'Sanitary Waste' },
  ];

  for (const { words, category } of keywords) {
    if (words.some(w => label.includes(w))) return category;
  }

  return 'Non-recyclable/General Waste';
}

/**
 * All canonical waste categories.
 */
const WASTE_CATEGORIES = [
  'Plastic',
  'Paper/Cardboard',
  'Glass',
  'Metal',
  'Organic/Wet Waste',
  'E-waste',
  'Hazardous Waste',
  'Textile',
  'Sanitary Waste',
  'Non-recyclable/General Waste',
];

module.exports = { mapLabelToCategory, LABEL_TO_CATEGORY, WASTE_CATEGORIES };
