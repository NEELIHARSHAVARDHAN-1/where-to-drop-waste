const path = require('path');

// Use separate test DB
process.env.DB_PATH = path.join(__dirname, '../data/test_classifier2.db');
process.env.NODE_ENV = 'test';

const { LocalTextClassifier } = require('../src/services/classifier');
const { calculateImpact } = require('../src/services/impactService');
const { initializeDatabase } = require('../src/database/db');
const { mapLabelToCategory, WASTE_CATEGORIES } = require('../src/services/vision/wasteCategoryMapping');
const { getModelStatus } = require('../src/services/vision/tensorflowService');
const { readAndValidateImage, validateImageBuffer } = require('../src/services/vision/preprocessing');

let classifier;

beforeAll(async () => {
  await initializeDatabase();
  classifier = new LocalTextClassifier();
}, 30000);

afterAll(() => {
  const fs = require('fs');
  const testDbPath = path.join(__dirname, '../data/test_classifier2.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) { /* ignore */ }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
describe('LocalTextClassifier', () => {
  test('exact match for plastic water bottle', () => {
    const result = classifier.classify('Plastic Water Bottle');
    expect(result.found).toBe(true);
    expect(result.category).toBe('Plastic');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('case-insensitive exact match', () => {
    const result = classifier.classify('newspaper');
    expect(result.found).toBe(true);
    expect(result.category).toBe('Paper/Cardboard');
  });

  test('alias match for aluminium can', () => {
    const result = classifier.classify('soda can');
    expect(result.found).toBe(true);
    expect(result.category).toBe('Metal');
  });

  test('partial match for cardboard', () => {
    const result = classifier.classify('cardboard box');
    expect(result.found).toBe(true);
    expect(result.category).toBe('Paper/Cardboard');
  });

  test('keyword inference for unknown plastic item', () => {
    const result = classifier.classify('PET container something');
    expect(result.category).toBe('Plastic');
    expect(result.is_uncertain).toBe(true);
  });

  test('returns unknown for completely unrecognized item', () => {
    const result = classifier.classify('zyxwvutsrqponmlkjih');
    expect(result.found).toBe(false);
    expect(result.category).toBe('Unknown');
  });

  test('includes circular economy tips', () => {
    const result = classifier.classify('glass bottle');
    expect(result.circular_economy_tips).toBeDefined();
    expect(Array.isArray(result.circular_economy_tips)).toBe(true);
  });

  test('mobile phone classified as e-waste', () => {
    const result = classifier.classify('mobile phone');
    expect(result.found).toBe(true);
    expect(result.category).toBe('E-waste');
  });

  test('food scraps classified as organic', () => {
    const result = classifier.classify('food scraps');
    expect(result.found).toBe(true);
    expect(result.category).toBe('Organic/Wet Waste');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('ImpactService', () => {
  test('calculates impact for paper correctly', () => {
    const impact = calculateImpact('Paper/Cardboard', 100);
    expect(impact.co2_saved_grams).toBe(90);
    expect(impact.water_saved_ml).toBe(2650);
    expect(impact.energy_saved_wh).toBe(410);
  });

  test('calculates impact for metal', () => {
    const impact = calculateImpact('Metal', 15);
    expect(impact.co2_saved_grams).toBeGreaterThan(0);
    expect(impact.weight_grams).toBe(15);
  });

  test('returns zero impact for non-recyclable', () => {
    const impact = calculateImpact('Non-recyclable/General Waste', 100);
    expect(impact.co2_saved_grams).toBe(0);
    expect(impact.water_saved_ml).toBe(0);
  });

  test('includes disclaimer', () => {
    const impact = calculateImpact('Plastic', 100);
    expect(impact.disclaimer).toBeDefined();
    expect(typeof impact.disclaimer).toBe('string');
  });

  test('handles unknown category gracefully', () => {
    const impact = calculateImpact('Unknown', 100);
    expect(impact.co2_saved_grams).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TF WasteCategoryMapping', () => {
  test('maps plastic_bottle to Plastic', () => {
    expect(mapLabelToCategory('plastic_bottle')).toBe('Plastic');
  });

  test('maps cardboard to Paper/Cardboard', () => {
    expect(mapLabelToCategory('cardboard')).toBe('Paper/Cardboard');
  });

  test('maps mobile_phone to E-waste', () => {
    expect(mapLabelToCategory('mobile_phone')).toBe('E-waste');
  });

  test('maps food_waste to Organic/Wet Waste', () => {
    expect(mapLabelToCategory('food_waste')).toBe('Organic/Wet Waste');
  });

  test('maps glass_bottle to Glass', () => {
    expect(mapLabelToCategory('glass_bottle')).toBe('Glass');
  });

  test('maps aluminium_can to Metal', () => {
    expect(mapLabelToCategory('aluminium_can')).toBe('Metal');
  });

  test('handles unknown label via keyword inference', () => {
    const result = mapLabelToCategory('plastic_thing_123');
    expect(result).toBe('Plastic');
  });

  test('handles null/undefined gracefully', () => {
    expect(mapLabelToCategory(null)).toBe('Unknown');
    expect(mapLabelToCategory(undefined)).toBe('Unknown');
    expect(mapLabelToCategory('')).toBe('Unknown');
  });

  test('WASTE_CATEGORIES contains all required categories', () => {
    expect(WASTE_CATEGORIES).toContain('Plastic');
    expect(WASTE_CATEGORIES).toContain('Paper/Cardboard');
    expect(WASTE_CATEGORIES).toContain('Glass');
    expect(WASTE_CATEGORIES).toContain('Metal');
    expect(WASTE_CATEGORIES).toContain('Organic/Wet Waste');
    expect(WASTE_CATEGORIES).toContain('E-waste');
    expect(WASTE_CATEGORIES).toContain('Hazardous Waste');
    expect(WASTE_CATEGORIES).toContain('Textile');
    expect(WASTE_CATEGORIES).toContain('Sanitary Waste');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('TF Model Status', () => {
  test('returns model status object', () => {
    const status = getModelStatus();
    expect(status).toBeDefined();
    expect(typeof status.modelAvailable).toBe('boolean');
    expect(typeof status.initialized).toBe('boolean');
  });

  test('modelAvailable is false when no model files present', () => {
    const status = getModelStatus();
    // In test environment, no model files → should be false or have an error
    if (!status.modelAvailable) {
      expect(status.error).toBeDefined();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('Image Preprocessing', () => {
  test('validateImageBuffer rejects empty buffer', () => {
    const result = validateImageBuffer(Buffer.alloc(0));
    expect(result.valid).toBe(false);
  });

  test('validateImageBuffer rejects non-image buffer', () => {
    const result = validateImageBuffer(Buffer.from('hello world this is not an image'));
    expect(result.valid).toBe(false);
  });

  test('validateImageBuffer detects JPEG magic bytes', () => {
    // JPEG starts with FF D8 FF
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const result = validateImageBuffer(jpeg);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('jpeg');
  });

  test('validateImageBuffer detects PNG magic bytes', () => {
    // PNG starts with 89 50 4E 47
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const result = validateImageBuffer(png);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('png');
  });

  test('readAndValidateImage returns error for nonexistent file', () => {
    const result = readAndValidateImage('/nonexistent/path/image.jpg');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('India Locations Data', () => {
  const locations = require('../data/india_locations.json');

  test('has country India', () => {
    expect(locations.country).toBe('India');
  });

  test('has 36 states/UTs (28 states + 8 UTs)', () => {
    expect(locations.states.length).toBe(36);
  });

  test('has 28 states', () => {
    const states = locations.states.filter(s => s.type === 'state');
    expect(states.length).toBe(28);
  });

  test('has 8 union territories', () => {
    const uts = locations.states.filter(s => s.type === 'union_territory');
    expect(uts.length).toBe(8);
  });

  test('Maharashtra has cities', () => {
    const mh = locations.states.find(s => s.name === 'Maharashtra');
    expect(mh).toBeDefined();
    expect(mh.cities).toContain('Mumbai');
    expect(mh.cities).toContain('Pune');
  });

  test('Delhi is a union territory with cities', () => {
    const delhi = locations.states.find(s => s.name === 'Delhi');
    expect(delhi).toBeDefined();
    expect(delhi.type).toBe('union_territory');
    expect(delhi.cities.length).toBeGreaterThan(0);
  });

  test('all states have at least one city', () => {
    for (const s of locations.states) {
      expect(s.cities.length).toBeGreaterThan(0);
    }
  });
});
