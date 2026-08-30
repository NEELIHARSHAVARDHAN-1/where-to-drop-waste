/**
 * Waste Classifier Service
 * 
 * Architecture: WasteClassifier (abstract interface)
 *   ├── LocalTextClassifier (keyword + fuzzy matching, always available)
 *   ├── ImageClassifier (vision-based, uses local classifier as fallback)
 *   └── IBMWatsonxClassifier (IBM AI integration, optional)
 * 
 * To integrate IBM watsonx:
 *   1. Set IBM_WATSONX_API_KEY, IBM_WATSONX_URL, IBM_WATSONX_PROJECT_ID in .env
 *   2. IBMWatsonxClassifier will automatically be used when credentials are present
 */

const { getDb } = require('../database/db');

// ─── CONFIDENCE LEVELS ────────────────────────────────────────────────────────
const CONFIDENCE = {
  HIGH: 0.9,
  MEDIUM: 0.7,
  LOW: 0.5,
  UNCERTAIN: 0.3,
};

// ─── LOCAL TEXT CLASSIFIER ────────────────────────────────────────────────────
class LocalTextClassifier {
  constructor() {
    this.name = 'LocalTextClassifier';
    this.description = 'Rule-based keyword matching classifier. Uses the waste items database.';
  }

  classify(inputText) {
    const db = getDb();
    const items = db.prepare('SELECT * FROM waste_items').all();

    const normalized = inputText.toLowerCase().trim();

    // 1. Exact name match
    let match = items.find(item => item.name.toLowerCase() === normalized);
    if (match) return this._buildResult(match, CONFIDENCE.HIGH, 'exact_match');

    // 2. Alias match
    for (const item of items) {
      try {
        const aliases = JSON.parse(item.aliases || '[]');
        if (aliases.some(a => a.toLowerCase() === normalized)) {
          return this._buildResult(item, CONFIDENCE.HIGH, 'alias_match');
        }
      } catch (e) { /* ignore parse errors */ }
    }

    // 3. Contains match (item name in input)
    match = items.find(item => normalized.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(normalized));
    if (match) return this._buildResult(match, CONFIDENCE.MEDIUM, 'partial_match');

    // 4. Alias contains
    for (const item of items) {
      try {
        const aliases = JSON.parse(item.aliases || '[]');
        if (aliases.some(a => normalized.includes(a.toLowerCase()) || a.toLowerCase().includes(normalized))) {
          return this._buildResult(item, CONFIDENCE.MEDIUM, 'alias_partial_match');
        }
      } catch (e) { /* ignore */ }
    }

    // 5. Keyword-based category inference
    const categoryResult = this._inferFromKeywords(normalized);
    if (categoryResult) return categoryResult;

    // 6. Not found
    return this._buildUnknownResult(inputText);
  }

  _inferFromKeywords(text) {
    const keywordMap = [
      { keywords: ['plastic', 'poly', 'pet', 'hdpe', 'pvc', 'ldpe', 'pp', 'ps'], category: 'Plastic', bin_label: 'Dry/Recyclable Waste (check resin code)', recyclable: 'conditional' },
      { keywords: ['paper', 'cardboard', 'newspaper', 'magazine', 'box', 'carton', 'book'], category: 'Paper/Cardboard', bin_label: 'Dry/Recyclable Waste', recyclable: 'yes' },
      { keywords: ['glass', 'bottle', 'jar', 'mirror'], category: 'Glass', bin_label: 'Glass Recycling', recyclable: 'yes' },
      { keywords: ['metal', 'aluminium', 'aluminum', 'steel', 'iron', 'copper', 'tin', 'can'], category: 'Metal', bin_label: 'Dry/Recyclable Waste', recyclable: 'yes' },
      { keywords: ['food', 'vegetable', 'fruit', 'organic', 'peel', 'leftover', 'kitchen waste', 'compost', 'banana', 'apple', 'mango'], category: 'Organic/Wet Waste', bin_label: 'Wet/Organic Waste', recyclable: 'yes' },
      { keywords: ['electronic', 'phone', 'mobile', 'computer', 'laptop', 'tablet', 'charger', 'cable', 'battery', 'tv', 'monitor'], category: 'E-waste', bin_label: 'E-waste Collection Point', recyclable: 'yes' },
      { keywords: ['chemical', 'paint', 'solvent', 'bleach', 'medicine', 'drug', 'pesticide', 'oil', 'acid', 'toxic', 'hazardous'], category: 'Hazardous Waste', bin_label: 'Hazardous Waste Collection', recyclable: 'no' },
      { keywords: ['cloth', 'textile', 'fabric', 'garment', 'shirt', 'jeans', 'jacket', 'dress', 'shoes', 'socks', 'underwear'], category: 'Textile', bin_label: 'Textile Donation / Recycling', recyclable: 'yes' },
      { keywords: ['diaper', 'sanitary', 'pad', 'tampon', 'nappy', 'tissue', 'wet wipe', 'cotton', 'bandage'], category: 'Sanitary Waste', bin_label: 'Sanitary/General Waste', recyclable: 'no' },
    ];

    for (const mapping of keywordMap) {
      if (mapping.keywords.some(kw => text.includes(kw))) {
        return {
          found: true,
          confidence: CONFIDENCE.LOW,
          match_type: 'keyword_inference',
          classifier: this.name,
          is_uncertain: true,
          uncertainty_reason: 'Matched by keyword inference — specific item not found in database',
          item_id: null,
          item_name: text,
          category: mapping.category,
          recyclable: mapping.recyclable,
          bin_label: mapping.bin_label,
          bin_color: 'grey',
          disposal_method: `Based on keyword analysis, this appears to be ${mapping.category}. Please verify specific disposal rules for your location.`,
          preparation_instructions: '',
          sustainability_info: '',
          estimated_weight_grams: 100,
          circular_economy_tips: [],
        };
      }
    }

    return null;
  }

  _buildResult(item, confidence, match_type) {
    return {
      found: true,
      confidence,
      match_type,
      classifier: this.name,
      is_uncertain: confidence < CONFIDENCE.MEDIUM,
      uncertainty_reason: confidence < CONFIDENCE.MEDIUM ? 'Low confidence match' : null,
      item_id: item.id,
      item_name: item.name,
      category: item.category,
      recyclable: item.recyclable,
      bin_label: item.bin_label,
      bin_color: item.bin_color,
      disposal_method: item.disposal_method,
      preparation_instructions: item.preparation_instructions,
      sustainability_info: item.sustainability_info,
      estimated_weight_grams: item.estimated_weight_grams,
      circular_economy_tips: this._getCircularTips(item),
    };
  }

  _buildUnknownResult(text) {
    return {
      found: false,
      confidence: 0,
      match_type: 'no_match',
      classifier: this.name,
      is_uncertain: true,
      uncertainty_reason: `Could not identify "${text}" in the waste database`,
      item_id: null,
      item_name: text,
      category: 'Unknown',
      recyclable: 'unknown',
      bin_label: 'Check local guidelines',
      bin_color: 'grey',
      disposal_method: 'Item not recognized. Please check local municipal waste guidelines or contact your waste management provider.',
      preparation_instructions: '',
      sustainability_info: 'When in doubt, do not recycle. Contamination can spoil entire recycling batches.',
      estimated_weight_grams: 100,
      circular_economy_tips: ['Consider if this item can be reused or repurposed before disposal', 'Check with your local waste management for guidance on unusual items'],
    };
  }

  _getCircularTips(item) {
    const tips = {
      'Plastic': ['Reuse containers for storage', 'Refill water bottles instead of buying new ones', 'Use as plant pots or organizers'],
      'Paper/Cardboard': ['Use for crafts or children activities', 'Shred for compost or packaging material', 'Reuse boxes for storage or moving'],
      'Glass': ['Reuse jars for storage, fermenting, or candles', 'Use as vases or drinking glasses', 'Great for preserving foods'],
      'Metal': ['Sell to scrap dealers', 'Reuse cans for organizers or planters', 'Repair before replacing appliances'],
      'Organic/Wet Waste': ['Compost at home for garden fertilizer', 'Bokashi or worm composting for small spaces', 'Share excess fruits/vegetables with neighbors'],
      'E-waste': ['Donate working electronics to schools or charities', 'Repair before replacing', 'Use manufacturer take-back programs'],
      'Textile': ['Donate to charities or thrift stores', 'Upcycle into cleaning rags, bags, or quilts', 'Swap with friends or family'],
      'Hazardous Waste': ['Use up completely to reduce waste', 'Choose less toxic alternatives next time', 'Look for product take-back programs'],
    };
    return tips[item.category] || ['Consider if this item can be reused or repurposed before disposal'];
  }
}

// ─── IMAGE CLASSIFIER ─────────────────────────────────────────────────────────
class ImageClassifier {
  constructor() {
    this.name = 'ImageClassifier';
    this.textClassifier = new LocalTextClassifier();
  }

  /**
   * Classifies waste from an image.
   * 
   * IBM watsonx integration point:
   * When IBM_WATSONX_API_KEY is configured, replace the fallback below with:
   *   const label = await ibmVisionService.classify(imagePath);
   *   return this.textClassifier.classify(label);
   * 
   * For now: accepts an optional hint from the client and uses text classification.
   */
  classify(imagePath, hint = '') {
    if (hint) {
      const result = this.textClassifier.classify(hint);
      return {
        ...result,
        classifier: 'ImageClassifier+TextFallback',
        image_path: imagePath,
        note: 'Image classification used text hint. Connect IBM watsonx Vision for AI image classification.',
      };
    }

    return {
      found: false,
      confidence: 0,
      match_type: 'image_no_hint',
      classifier: this.name,
      is_uncertain: true,
      uncertainty_reason: 'Image classification requires IBM watsonx or similar AI vision service.',
      item_id: null,
      item_name: 'Unknown (image)',
      category: 'Unknown',
      recyclable: 'unknown',
      bin_label: 'Check local guidelines',
      bin_color: 'grey',
      disposal_method: 'Image classification is not yet available without AI credentials. Please type the item name for text-based classification.',
      preparation_instructions: '',
      sustainability_info: '',
      estimated_weight_grams: 100,
      circular_economy_tips: [],
      image_path: imagePath,
      ibm_integration_note: 'Configure IBM_WATSONX_API_KEY and IBM_WATSONX_URL in .env to enable AI image classification.',
    };
  }
}

// ─── IBM watsonx CLASSIFIER (stub — ready for integration) ───────────────────
class IBMWatsonxClassifier {
  constructor() {
    this.name = 'IBMWatsonxClassifier';
    this.apiKey = process.env.IBM_WATSONX_API_KEY;
    this.url = process.env.IBM_WATSONX_URL;
    this.projectId = process.env.IBM_WATSONX_PROJECT_ID;
    this.textFallback = new LocalTextClassifier();
  }

  isConfigured() {
    return !!(this.apiKey && this.url && this.projectId);
  }

  async classify(inputText) {
    if (!this.isConfigured()) {
      return this.textFallback.classify(inputText);
    }

    // ─── IBM watsonx Integration Point ───────────────────────────────────────
    // When credentials are present, implement the IBM watsonx API call here.
    // Example prompt to send to watsonx:
    //   "Classify the following waste item: '{inputText}'. 
    //    Return: category, recyclable (yes/no/conditional), disposal_method, 
    //    preparation_instructions, sustainability_info"
    // ─────────────────────────────────────────────────────────────────────────
    
    // For now, fall through to local classifier even when configured
    // Replace the line below with actual IBM API call
    return this.textFallback.classify(inputText);
  }
}

// ─── CLASSIFIER FACTORY ───────────────────────────────────────────────────────
const localTextClassifier = new LocalTextClassifier();
const imageClassifier = new ImageClassifier();
const ibmClassifier = new IBMWatsonxClassifier();

function getClassifier(type = 'text') {
  if (type === 'image') return imageClassifier;
  if (ibmClassifier.isConfigured()) return ibmClassifier;
  return localTextClassifier;
}

module.exports = {
  LocalTextClassifier,
  ImageClassifier,
  IBMWatsonxClassifier,
  getClassifier,
  CONFIDENCE,
};
