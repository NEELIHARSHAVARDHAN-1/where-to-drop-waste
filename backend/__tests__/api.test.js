const request = require('supertest');
const path = require('path');

// Use in-memory DB for tests
process.env.DB_PATH = path.join(__dirname, '../data/test_waste_app.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';

const app = require('../src/app');
const { initializeDatabase } = require('../src/database/db');

beforeAll(async () => {
  await initializeDatabase();
});

describe('Health Check', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth Routes', () => {
  const testEmail = `test_${Date.now()}@example.com`;
  let authToken;

  test('POST /api/auth/register - creates new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: testEmail,
      password: 'Test@123',
      location_country: 'India',
      location_state: 'Maharashtra',
      location_city: 'Mumbai',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    authToken = res.body.token;
  });

  test('POST /api/auth/register - rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate',
      email: testEmail,
      password: 'Test@123',
    });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login - authenticates user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'Test@123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login - rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me - returns user with valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  test('GET /api/auth/me - rejects without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Classification Routes', () => {
  test('POST /api/classify/text - classifies plastic bottle', async () => {
    const res = await request(app).post('/api/classify/text').send({ item: 'Plastic Water Bottle' });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('Plastic');
    expect(res.body.found).toBe(true);
  });

  test('POST /api/classify/text - handles unknown item gracefully', async () => {
    const res = await request(app).post('/api/classify/text').send({ item: 'zxcvbnm123qwerty' });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    expect(res.body.category).toBe('Unknown');
  });

  test('POST /api/classify/text - validates empty input', async () => {
    const res = await request(app).post('/api/classify/text').send({ item: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/classify/text - includes local rules for known location', async () => {
    const res = await request(app).post('/api/classify/text').send({
      item: 'Newspaper',
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
    });
    expect(res.status).toBe(200);
    expect(res.body.local_rule).toBeDefined();
  });

  test('POST /api/classify/confirm - accepts confirmation', async () => {
    // First classify
    const classifyRes = await request(app).post('/api/classify/text').send({ item: 'Glass Bottle' });
    const classificationId = classifyRes.body.classification_id;

    const confirmRes = await request(app).post('/api/classify/confirm').send({
      classification_id: classificationId,
      confirmed: true,
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
  });

  test('GET /api/classify/model-status - returns TF model status', async () => {
    const res = await request(app).get('/api/classify/model-status');
    expect(res.status).toBe(200);
    expect(typeof res.body.modelAvailable).toBe('boolean');
  });

  test('POST /api/classify/correct - stores user correction as training candidate', async () => {
    // First classify
    const classifyRes = await request(app).post('/api/classify/text').send({ item: 'some unknown item xyz' });
    const classificationId = classifyRes.body.classification_id;

    const correctRes = await request(app).post('/api/classify/correct').send({
      classification_id: classificationId,
      corrected_class: 'plastic_bottle',
    });
    expect(correctRes.status).toBe(200);
    expect(correctRes.body.success).toBe(true);
    expect(correctRes.body.training_candidate_id).toBeDefined();
  });
});

describe('Locations Routes', () => {
  test('GET /api/locations/india - returns full India data', async () => {
    const res = await request(app).get('/api/locations/india');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('India');
    expect(Array.isArray(res.body.states)).toBe(true);
    expect(res.body.states.length).toBe(36);
  });

  test('GET /api/locations/india/states - returns states list', async () => {
    const res = await request(app).get('/api/locations/india/states');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(36);
  });

  test('GET /api/locations/india/cities?state=Maharashtra - returns cities', async () => {
    const res = await request(app).get('/api/locations/india/cities?state=Maharashtra');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('Maharashtra');
    expect(Array.isArray(res.body.cities)).toBe(true);
    expect(res.body.cities).toContain('Mumbai');
  });

  test('GET /api/locations/india/cities - requires state param', async () => {
    const res = await request(app).get('/api/locations/india/cities');
    expect(res.status).toBe(400);
  });

  test('GET /api/locations/india/cities?state=NonExistent - returns 404', async () => {
    const res = await request(app).get('/api/locations/india/cities?state=NonExistentState99');
    expect(res.status).toBe(404);
  });
});

describe('Rules Routes', () => {
  test('GET /api/rules?country=India - returns rules', async () => {
    const res = await request(app).get('/api/rules?country=India');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
    expect(res.body.disclaimer).toBeDefined();
  });

  test('GET /api/rules - requires country param', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(400);
  });

  test('GET /api/rules/countries - lists countries', async () => {
    const res = await request(app).get('/api/rules/countries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.includes('India')).toBe(true);
  });
});

describe('Leaderboard Routes', () => {
  test('GET /api/leaderboard - returns ranked users', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('rank');
  });
});

describe('Tips Routes', () => {
  test('GET /api/tips - returns eco tips', async () => {
    const res = await request(app).get('/api/tips');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/tips/daily - returns one tip', async () => {
    const res = await request(app).get('/api/tips/daily');
    expect(res.status).toBe(200);
  });
});

describe('Waste Items Routes', () => {
  test('GET /api/waste-items - returns items', async () => {
    const res = await request(app).get('/api/waste-items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/waste-items?category=Plastic - filters by category', async () => {
    const res = await request(app).get('/api/waste-items?category=Plastic');
    expect(res.status).toBe(200);
    expect(res.body.every(i => i.category === 'Plastic')).toBe(true);
  });

  test('GET /api/waste-items/categories - lists categories', async () => {
    const res = await request(app).get('/api/waste-items/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Challenges Routes', () => {
  test('GET /api/challenges - returns challenges', async () => {
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// Cleanup
afterAll(() => {
  const fs = require('fs');
  const testDbPath = path.join(__dirname, '../data/test_waste_app.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) { /* ignore */ }
  }
});
