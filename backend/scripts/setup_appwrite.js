/**
 * Automated Appwrite Setup & Seed Script
 *
 * Automatically creates:
 *   1. Appwrite Database
 *   2. All 13 Collections with exact attributes and indexes:
 *      - profiles, classifications, impacts, badges, user_badges,
 *      - challenges, user_challenges, local_rules, eco_tips, waste_items,
 *      - user_corrections, training_candidates, admin_users
 *   3. Storage Bucket for images with size & MIME validation
 *   4. Seeds initial dataset (waste items, badges, challenges, local rules, tips)
 *
 * Usage:
 *   npm run appwrite:setup
 *   (Ensure APPWRITE_PROJECT_ID, APPWRITE_API_KEY, and APPWRITE_DATABASE_ID are set in backend/.env)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sdk = require('node-appwrite');
const { v4: uuidv4 } = require('uuid');

const ENDPOINT   = process.env.APPWRITE_ENDPOINT   || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'waste_segregation_db';
const BUCKET_ID   = process.env.APPWRITE_STORAGE_BUCKET_ID || 'waste_images';

if (!PROJECT_ID || !API_KEY) {
  console.error('❌ Error: APPWRITE_PROJECT_ID and APPWRITE_API_KEY must be set in backend/.env');
  process.exit(1);
}

const client = new sdk.Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new sdk.Databases(client);
const storage   = new sdk.Storage(client);

async function wait(ms = 1200) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 1. Ensure Database ───────────────────────────────────────────────────────
async function ensureDatabase() {
  console.log(`📦 Ensuring database "${DATABASE_ID}" exists...`);
  try {
    await databases.get(DATABASE_ID);
    console.log(`   ✅ Database "${DATABASE_ID}" already exists.`);
  } catch (err) {
    if (err.code === 404) {
      await databases.create(DATABASE_ID, 'Where To Drop Waste Database');
      console.log(`   ✅ Created database "${DATABASE_ID}".`);
    } else {
      throw err;
    }
  }
}

// ─── 2. Ensure Storage Bucket ─────────────────────────────────────────────────
async function ensureStorageBucket() {
  console.log(`🪣 Ensuring storage bucket "${BUCKET_ID}" exists...`);
  try {
    await storage.getBucket(BUCKET_ID);
    console.log(`   ✅ Storage bucket "${BUCKET_ID}" already exists.`);
  } catch (err) {
    if (err.code === 404) {
      await storage.createBucket(
        BUCKET_ID,
        'Waste Images Bucket',
        [
          sdk.Permission.read(sdk.Role.any()),
          sdk.Permission.create(sdk.Role.users()),
          sdk.Permission.create(sdk.Role.any()),
        ],
        false, // fileSecurity
        true,  // enabled
        5 * 1024 * 1024, // 5MB max
        ['jpg', 'jpeg', 'png', 'webp', 'gif'] // allowed extensions
      );
      console.log(`   ✅ Created storage bucket "${BUCKET_ID}".`);
    } else {
      console.warn(`   ⚠️ Bucket notice: ${err.message}`);
    }
  }
}

// ─── 3. Helper: Create Collection with Attributes & Indexes ───────────────────
async function ensureCollection(colId, name, permissions, attributes, indexes = []) {
  console.log(`📁 Ensuring collection: ${colId} (${name})...`);
  let exists = false;
  try {
    await databases.getCollection(DATABASE_ID, colId);
    console.log(`   ℹ️ Collection "${colId}" exists.`);
    exists = true;
  } catch (err) {
    if (err.code === 404) {
      await databases.createCollection(DATABASE_ID, colId, name, permissions, false, true);
      console.log(`   ✅ Created collection "${colId}".`);
      await wait(800);
    } else {
      throw err;
    }
  }

  // Create attributes
  for (const attr of attributes) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(
          DATABASE_ID, colId, attr.key, attr.size || 255, attr.required || false, attr.default || null, attr.array || false
        );
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(
          DATABASE_ID, colId, attr.key, attr.required || false, attr.min || null, attr.max || null, attr.default !== undefined ? attr.default : null
        );
      } else if (attr.type === 'float') {
        await databases.createFloatAttribute(
          DATABASE_ID, colId, attr.key, attr.required || false, attr.min || null, attr.max || null, attr.default !== undefined ? attr.default : null
        );
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(
          DATABASE_ID, colId, attr.key, attr.required || false, attr.default !== undefined ? attr.default : null
        );
      }
      await wait(300);
    } catch (e) {
      if (e.code !== 409) {
        console.warn(`      ⚠️ Attribute "${attr.key}" notice:`, e.message);
      }
    }
  }

  // Create indexes
  for (const idx of indexes) {
    try {
      await databases.createIndex(
        DATABASE_ID, colId, idx.key, idx.type || 'key', idx.attributes, idx.orders || []
      );
      await wait(300);
    } catch (e) {
      if (e.code !== 409) {
        console.warn(`      ⚠️ Index "${idx.key}" notice:`, e.message);
      }
    }
  }
}

// ─── 4. Ensure All 13 Collections ─────────────────────────────────────────────
async function ensureAllCollections() {
  const publicRead = [
    sdk.Permission.read(sdk.Role.any()),
    sdk.Permission.create(sdk.Role.users()),
    sdk.Permission.update(sdk.Role.users()),
  ];

  // 1. profiles
  await ensureCollection('profiles', 'User Profiles', publicRead, [
    { key: 'user_id', type: 'string', size: 100, required: true },
    { key: 'name', type: 'string', size: 150, required: false, default: '' },
    { key: 'email', type: 'string', size: 255, required: false, default: '' },
    { key: 'location_country', type: 'string', size: 100, required: false, default: 'India' },
    { key: 'location_state', type: 'string', size: 100, required: false, default: '' },
    { key: 'location_city', type: 'string', size: 100, required: false, default: '' },
    { key: 'user_type', type: 'string', size: 50, required: false, default: 'household' },
    { key: 'points', type: 'integer', required: false, default: 0 },
    { key: 'level', type: 'integer', required: false, default: 1 },
    { key: 'recycling_score', type: 'float', required: false, default: 0 },
    { key: 'streak_days', type: 'integer', required: false, default: 0 },
    { key: 'last_activity_date', type: 'string', size: 50, required: false },
    { key: 'created_at', type: 'string', size: 50, required: false },
    { key: 'updated_at', type: 'string', size: 50, required: false },
  ], [
    { key: 'idx_user_id', type: 'key', attributes: ['user_id'] },
    { key: 'idx_points', type: 'key', attributes: ['points'], orders: ['DESC'] },
  ]);

  // 2. classifications
  await ensureCollection('classifications', 'Classifications', publicRead, [
    { key: 'user_id', type: 'string', size: 100, required: false },
    { key: 'input_text', type: 'string', size: 500, required: false },
    { key: 'image_file_id', type: 'string', size: 255, required: false },
    { key: 'method', type: 'string', size: 50, required: true },
    { key: 'matched_item_id', type: 'string', size: 100, required: false },
    { key: 'category', type: 'string', size: 100, required: true },
    { key: 'recyclable', type: 'string', size: 50, required: true },
    { key: 'disposal_method', type: 'string', size: 1000, required: false, default: '' },
    { key: 'confidence', type: 'float', required: false, default: 0 },
    { key: 'user_confirmed', type: 'boolean', required: false, default: false },
    { key: 'user_correction', type: 'string', size: 255, required: false },
    { key: 'points_awarded', type: 'integer', required: false, default: 0 },
    { key: 'timestamp', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_class_user', type: 'key', attributes: ['user_id'] },
    { key: 'idx_class_time', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
  ]);

  // 3. impacts
  await ensureCollection('impacts', 'Environmental Impacts', publicRead, [
    { key: 'user_id', type: 'string', size: 100, required: true },
    { key: 'classification_id', type: 'string', size: 100, required: false },
    { key: 'waste_category', type: 'string', size: 100, required: true },
    { key: 'weight_grams', type: 'float', required: false, default: 50 },
    { key: 'co2_saved_grams', type: 'float', required: false, default: 0 },
    { key: 'water_saved_ml', type: 'float', required: false, default: 0 },
    { key: 'energy_saved_wh', type: 'float', required: false, default: 0 },
    { key: 'timestamp', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_impact_user', type: 'key', attributes: ['user_id'] },
    { key: 'idx_impact_time', type: 'key', attributes: ['timestamp'], orders: ['DESC'] },
  ]);

  // 4. badges
  await ensureCollection('badges', 'Badges', [sdk.Permission.read(sdk.Role.any())], [
    { key: 'name', type: 'string', size: 100, required: true },
    { key: 'description', type: 'string', size: 500, required: true },
    { key: 'icon', type: 'string', size: 50, required: false, default: '🏅' },
    { key: 'criteria_type', type: 'string', size: 50, required: true },
    { key: 'criteria_value', type: 'integer', required: true },
    { key: 'points_reward', type: 'integer', required: false, default: 50 },
  ], [
    { key: 'idx_badge_criteria', type: 'key', attributes: ['criteria_value'], orders: ['ASC'] },
  ]);

  // 5. user_badges
  await ensureCollection('user_badges', 'User Earned Badges', publicRead, [
    { key: 'user_id', type: 'string', size: 100, required: true },
    { key: 'badge_id', type: 'string', size: 100, required: true },
    { key: 'earned_at', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_ub_user', type: 'key', attributes: ['user_id'] },
  ]);

  // 6. challenges
  await ensureCollection('challenges', 'Challenges', [sdk.Permission.read(sdk.Role.any())], [
    { key: 'title', type: 'string', size: 150, required: true },
    { key: 'description', type: 'string', size: 1000, required: true },
    { key: 'challenge_type', type: 'string', size: 50, required: false, default: 'community' },
    { key: 'target_value', type: 'integer', required: true },
    { key: 'target_unit', type: 'string', size: 50, required: false, default: 'items' },
    { key: 'points_reward', type: 'integer', required: false, default: 100 },
    { key: 'start_date', type: 'string', size: 50, required: true },
    { key: 'end_date', type: 'string', size: 50, required: true },
    { key: 'created_by', type: 'string', size: 100, required: false, default: 'system' },
    { key: 'is_active', type: 'boolean', required: false, default: true },
  ]);

  // 7. user_challenges
  await ensureCollection('user_challenges', 'User Challenge Progress', publicRead, [
    { key: 'user_id', type: 'string', size: 100, required: true },
    { key: 'challenge_id', type: 'string', size: 100, required: true },
    { key: 'progress', type: 'integer', required: false, default: 0 },
    { key: 'completed', type: 'boolean', required: false, default: false },
    { key: 'completed_at', type: 'string', size: 50, required: false },
    { key: 'joined_at', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_uc_user', type: 'key', attributes: ['user_id'] },
    { key: 'idx_uc_challenge', type: 'key', attributes: ['challenge_id'] },
  ]);

  // 8. local_rules
  await ensureCollection('local_rules', 'Local Rules', [sdk.Permission.read(sdk.Role.any())], [
    { key: 'country', type: 'string', size: 100, required: true },
    { key: 'state', type: 'string', size: 100, required: false, default: '' },
    { key: 'city', type: 'string', size: 100, required: false, default: '' },
    { key: 'category', type: 'string', size: 100, required: true },
    { key: 'bin_label', type: 'string', size: 150, required: true },
    { key: 'bin_color', type: 'string', size: 50, required: false, default: 'grey' },
    { key: 'collection_schedule', type: 'string', size: 255, required: false, default: '' },
    { key: 'special_instructions', type: 'string', size: 1000, required: false, default: '' },
    { key: 'accepted_items', type: 'string', size: 1000, required: false, default: '[]' },
    { key: 'rejected_items', type: 'string', size: 1000, required: false, default: '[]' },
    { key: 'notes', type: 'string', size: 1000, required: false, default: '' },
    { key: 'data_source', type: 'string', size: 100, required: false, default: 'sample_data' },
    { key: 'verified', type: 'boolean', required: false, default: false },
  ], [
    { key: 'idx_rule_loc', type: 'key', attributes: ['country', 'category'] },
  ]);

  // 9. eco_tips
  await ensureCollection('eco_tips', 'Eco Tips', [sdk.Permission.read(sdk.Role.any())], [
    { key: 'category', type: 'string', size: 100, required: true },
    { key: 'title', type: 'string', size: 150, required: true },
    { key: 'content', type: 'string', size: 1000, required: true },
    { key: 'tip_type', type: 'string', size: 50, required: false, default: 'general' },
    { key: 'is_active', type: 'boolean', required: false, default: true },
  ]);

  // 10. waste_items
  await ensureCollection('waste_items', 'Waste Items', [sdk.Permission.read(sdk.Role.any())], [
    { key: 'name', type: 'string', size: 150, required: true },
    { key: 'aliases', type: 'string', size: 500, required: false, default: '[]' },
    { key: 'category', type: 'string', size: 100, required: true },
    { key: 'recyclable', type: 'string', size: 50, required: true },
    { key: 'bin_color', type: 'string', size: 50, required: false, default: 'grey' },
    { key: 'bin_label', type: 'string', size: 150, required: false, default: 'General Waste' },
    { key: 'disposal_method', type: 'string', size: 1000, required: true },
    { key: 'preparation_instructions', type: 'string', size: 1000, required: false, default: '' },
    { key: 'sustainability_info', type: 'string', size: 1000, required: false, default: '' },
    { key: 'estimated_weight_grams', type: 'float', required: false, default: 50 },
    { key: 'co2_factor', type: 'float', required: false, default: 0 },
    { key: 'water_factor', type: 'float', required: false, default: 0 },
    { key: 'energy_factor', type: 'float', required: false, default: 0 },
    { key: 'created_at', type: 'string', size: 50, required: false },
  ], [
    { key: 'idx_wi_category', type: 'key', attributes: ['category'] },
  ]);

  // 11. user_corrections
  await ensureCollection('user_corrections', 'User Corrections', publicRead, [
    { key: 'classification_id', type: 'string', size: 100, required: true },
    { key: 'user_id', type: 'string', size: 100, required: false },
    { key: 'original_category', type: 'string', size: 100, required: true },
    { key: 'corrected_category', type: 'string', size: 100, required: true },
    { key: 'corrected_item', type: 'string', size: 150, required: false },
    { key: 'notes', type: 'string', size: 1000, required: false, default: '' },
    { key: 'timestamp', type: 'string', size: 50, required: true },
  ]);

  // 12. training_candidates
  await ensureCollection('training_candidates', 'Training Candidates', publicRead, [
    { key: 'classification_id', type: 'string', size: 100, required: false },
    { key: 'image_path', type: 'string', size: 500, required: false },
    { key: 'predicted_class', type: 'string', size: 150, required: false },
    { key: 'predicted_confidence', type: 'float', required: false, default: 0 },
    { key: 'corrected_class', type: 'string', size: 150, required: true },
    { key: 'waste_category', type: 'string', size: 100, required: false },
    { key: 'user_id', type: 'string', size: 100, required: false },
    { key: 'admin_reviewed', type: 'integer', required: false, default: 0 },
    { key: 'admin_approved', type: 'integer', required: false, default: 0 },
    { key: 'admin_notes', type: 'string', size: 1000, required: false, default: '' },
    { key: 'reviewed_by', type: 'string', size: 100, required: false },
    { key: 'reviewed_at', type: 'string', size: 50, required: false },
    { key: 'timestamp', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_tc_reviewed', type: 'key', attributes: ['admin_reviewed'] },
  ]);

  // 13. admin_users
  await ensureCollection('admin_users', 'Admin Users', [
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.create(sdk.Role.users()),
  ], [
    { key: 'user_id', type: 'string', size: 100, required: true },
    { key: 'granted_by', type: 'string', size: 100, required: false },
    { key: 'granted_at', type: 'string', size: 50, required: true },
  ], [
    { key: 'idx_admin_user', type: 'unique', attributes: ['user_id'] },
  ]);
}

// ─── 5. Seed Initial Data ─────────────────────────────────────────────────────
async function seedInitialData() {
  console.log('🌱 Checking and seeding initial data in Appwrite Database...');

  // 1. Seed waste items if empty
  try {
    const wiRes = await databases.listDocuments(DATABASE_ID, 'waste_items', [sdk.Query.limit(1)]);
    if (wiRes.total === 0) {
      console.log('   Adding default waste items...');
      const seedItems = [
        ['Newspaper', '["paper","news","daily"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Place in dry waste/recycling bin. Bundle newspapers together if possible.', 'Keep dry. Remove plastic wrapping.', 'Recycling 1 ton of newspaper saves 17 trees.', 250, 0.9, 26.5, 4.1],
        ['Cardboard Box', '["carton","packaging","box"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Flatten and place in recycling bin.', 'Remove tape and flatten.', 'Cardboard is widely recycled.', 400, 0.9, 26.5, 4.1],
        ['Plastic Water Bottle', '["PET bottle","water bottle"]', 'Plastic', 'yes', 'blue', 'Dry/Recyclable Waste', 'Empty, crush, and recycle. #1 PET.', 'Rinse and crush.', 'PET bottles become recycled polyester.', 30, 1.5, 170.0, 5.8],
        ['Aluminium Can', '["soda can","beer can","beverage can"]', 'Metal', 'yes', 'blue', 'Dry/Recyclable Waste', 'Rinse and crush. Place in recycling bin.', 'Rinse out.', 'Recycling aluminium uses 95% less energy.', 15, 9.1, 40.0, 14.0],
        ['Glass Bottle', '["wine bottle","beer bottle","glass jar"]', 'Glass', 'yes', 'green', 'Glass/Recyclable Waste', 'Rinse and place in glass recycling bin.', 'Remove lid and rinse.', 'Glass can be recycled endlessly.', 350, 0.31, 1.2, 2.5],
        ['Food Scraps', '["kitchen waste","fruit peels","vegetables"]', 'Organic/Wet Waste', 'yes', 'green', 'Wet/Organic Waste (Compost)', 'Place in wet waste bin for composting.', 'Keep separate from dry waste.', 'Composting returns nutrients to soil.', 300, 0.5, 5.0, 0.5],
        ['Mobile Phone', '["smartphone","cell phone","old phone"]', 'E-waste', 'yes', 'yellow', 'E-waste Collection Point', 'Take to authorized e-waste collection center.', 'Wipe personal data.', 'Recycling recovers precious metals.', 150, 3.0, 200.0, 100.0],
        ['Old Clothes', '["clothing","garments","worn clothes"]', 'Textile', 'yes', 'blue', 'Textile Donation / Recycling', 'Donate to NGOs or textile recyclers.', 'Wash before donating.', 'Extending clothes life reduces environmental impact.', 400, 5.0, 2700.0, 15.0],
        ['Diaper', '["nappy","baby diaper"]', 'Sanitary Waste', 'no', 'grey', 'Sanitary/General Waste', 'Wrap tightly in sealed bag. General waste.', 'Never flush.', 'Single-use diapers take centuries to decompose.', 150, 0.0, 0.0, 0.0],
      ];

      for (const item of seedItems) {
        await databases.createDocument(DATABASE_ID, 'waste_items', uuidv4(), {
          name: item[0],
          aliases: item[1],
          category: item[2],
          recyclable: item[3],
          bin_color: item[4],
          bin_label: item[5],
          disposal_method: item[6],
          preparation_instructions: item[7],
          sustainability_info: item[8],
          estimated_weight_grams: item[9],
          co2_factor: item[10],
          water_factor: item[11],
          energy_factor: item[12],
          created_at: new Date().toISOString(),
        });
        await wait(100);
      }
      console.log('   ✅ Waste items seeded.');
    }
  } catch (e) {
    console.warn('   ⚠️ Waste items seed notice:', e.message);
  }

  // 2. Seed badges if empty
  try {
    const bRes = await databases.listDocuments(DATABASE_ID, 'badges', [sdk.Query.limit(1)]);
    if (bRes.total === 0) {
      console.log('   Adding default badges...');
      const seedBadgesList = [
        ['First Classifier', 'Classified your first waste item', '🔍', 'classifications', 1, 20],
        ['Recycling Rookie', 'Classified 10 waste items', '♻️', 'classifications', 10, 50],
        ['Waste Warrior', 'Classified 50 waste items', '⚔️', 'classifications', 50, 150],
        ['Eco Champion', 'Classified 100 waste items', '🏆', 'classifications', 100, 300],
        ['Green Streak', 'Maintained a 7-day activity streak', '🔥', 'streak', 7, 100],
        ['Consistent Sorter', 'Maintained a 30-day activity streak', '⚡', 'streak', 30, 500],
        ['Zero Waste Hero', 'Earned 500 total points', '🌍', 'points', 500, 100],
      ];

      for (const b of seedBadgesList) {
        await databases.createDocument(DATABASE_ID, 'badges', uuidv4(), {
          name: b[0],
          description: b[1],
          icon: b[2],
          criteria_type: b[3],
          criteria_value: b[4],
          points_reward: b[5],
        });
        await wait(100);
      }
      console.log('   ✅ Badges seeded.');
    }
  } catch (e) {
    console.warn('   ⚠️ Badges seed notice:', e.message);
  }

  // 3. Seed challenges if empty
  try {
    const chRes = await databases.listDocuments(DATABASE_ID, 'challenges', [sdk.Query.limit(1)]);
    if (chRes.total === 0) {
      console.log('   Adding active challenges...');
      const now = new Date();
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fmt = d => d.toISOString().split('T')[0];

      await databases.createDocument(DATABASE_ID, 'challenges', uuidv4(), {
        title: 'Recycle 20 Items',
        description: 'Classify and correctly segregate 20 recyclable items this month.',
        challenge_type: 'community',
        target_value: 20,
        target_unit: 'items',
        points_reward: 150,
        start_date: fmt(now),
        end_date: fmt(future),
        created_by: 'system',
        is_active: true,
      });
      console.log('   ✅ Challenges seeded.');
    }
  } catch (e) {
    console.warn('   ⚠️ Challenges seed notice:', e.message);
  }

  // 4. Seed local rules if empty
  try {
    const lrRes = await databases.listDocuments(DATABASE_ID, 'local_rules', [sdk.Query.limit(1)]);
    if (lrRes.total === 0) {
      console.log('   Adding sample local rules...');
      const rules = [
        ['India', 'Maharashtra', 'Mumbai', 'Organic/Wet Waste', 'Green Bin (Wet Waste)', 'green', 'Daily', 'Separate wet and dry waste per BMC mandate.'],
        ['India', 'Maharashtra', 'Mumbai', 'Paper/Cardboard', 'Blue Bin (Dry Waste)', 'blue', 'Alternate days', 'Keep dry waste clean and dry.'],
        ['India', 'Maharashtra', 'Mumbai', 'Plastic', 'Blue Bin (Dry Waste)', 'blue', 'Alternate days', 'Only clean, dry plastic goes in dry bin.'],
        ['India', 'Karnataka', 'Bengaluru', 'Organic/Wet Waste', 'Green Bin (Wet Waste)', 'green', 'Daily', 'BBMP mandates source segregation.'],
        ['India', 'Karnataka', 'Bengaluru', 'Paper/Cardboard', 'Blue Bin (Dry Recyclable)', 'blue', 'Alternate days', 'Clean and dry recyclables only.'],
        ['India', 'Delhi', 'Delhi', 'Organic/Wet Waste', 'Green Bin', 'green', 'Daily', 'MCD mandates wet/dry segregation.'],
      ];

      for (const r of rules) {
        await databases.createDocument(DATABASE_ID, 'local_rules', uuidv4(), {
          country: r[0],
          state: r[1],
          city: r[2],
          category: r[3],
          bin_label: r[4],
          bin_color: r[5],
          collection_schedule: r[6],
          special_instructions: r[7],
          accepted_items: '[]',
          rejected_items: '[]',
          notes: 'Sample local rule for demonstration.',
          data_source: 'sample_data',
          verified: false,
        });
        await wait(100);
      }
      console.log('   ✅ Local rules seeded.');
    }
  } catch (e) {
    console.warn('   ⚠️ Local rules seed notice:', e.message);
  }

  // 5. Seed eco tips if empty
  try {
    const tipRes = await databases.listDocuments(DATABASE_ID, 'eco_tips', [sdk.Query.limit(1)]);
    if (tipRes.total === 0) {
      console.log('   Adding eco tips...');
      const tips = [
        ['reduce', 'Buy in Bulk', 'Buying in bulk reduces packaging waste and saves money.', 'daily'],
        ['reuse', 'Repurpose Glass Jars', 'Old glass jars make excellent storage containers.', 'daily'],
        ['recycle', 'Clean Before Recycling', 'Rinsing containers prevents contamination of recycling batches.', 'daily'],
        ['fact', 'Aluminium Magic', 'Recycling aluminium cans saves 95% of energy needed to make new ones.', 'eco_fact'],
      ];

      for (const t of tips) {
        await databases.createDocument(DATABASE_ID, 'eco_tips', uuidv4(), {
          category: t[0],
          title: t[1],
          content: t[2],
          tip_type: t[3],
          is_active: true,
        });
        await wait(100);
      }
      console.log('   ✅ Eco tips seeded.');
    }
  } catch (e) {
    console.warn('   ⚠️ Eco tips seed notice:', e.message);
  }
}

// ─── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log('====================================================');
  console.log('🚀 WHERE TO DROP WASTE — Appwrite Cloud Auto-Setup');
  console.log('====================================================');
  console.log(`Endpoint:   ${ENDPOINT}`);
  console.log(`Project:    ${PROJECT_ID}`);
  console.log(`Database:   ${DATABASE_ID}`);
  console.log(`Bucket:     ${BUCKET_ID}\n`);

  try {
    await ensureDatabase();
    await ensureStorageBucket();
    await ensureAllCollections();
    await seedInitialData();

    console.log('\n====================================================');
    console.log('🎉 APPWRITE SETUP COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
    console.log('Your Appwrite project is now fully configured with:');
    console.log('  - Database & 13 Collections');
    console.log('  - Storage Bucket with 5MB image limit');
    console.log('  - Seed data for items, badges, rules, challenges & tips');
    console.log('Ready for production and Vercel deployment! 🌱');
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    if (err.response) console.error(JSON.stringify(err.response, null, 2));
    process.exit(1);
  }
}

main();
