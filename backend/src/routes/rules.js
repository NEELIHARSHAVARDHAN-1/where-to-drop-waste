const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

// GET /api/rules?country=India&state=Maharashtra&city=Mumbai
router.get('/', (req, res) => {
  const { country, state, city, category } = req.query;
  if (!country) return res.status(400).json({ error: 'country query parameter is required' });

  const db = getDb();
  let query = 'SELECT * FROM local_rules WHERE country = ?';
  const params = [country];

  if (state) { query += ' AND (state = ? OR state = "")'; params.push(state); }
  if (city) { query += ' AND (city = ? OR city = "")'; params.push(city); }
  if (category) { query += ' AND category = ?'; params.push(category); }

  query += ' ORDER BY CASE WHEN city != "" THEN 3 WHEN state != "" THEN 2 ELSE 1 END DESC';

  const rules = db.prepare(query).all(...params);

  res.json({
    rules,
    disclaimer: '⚠️ SAMPLE DATA — These localized rules are for demonstration purposes only. Always verify with your local municipal authority for official, current waste management guidelines.',
    country, state: state || null, city: city || null,
  });
});

// GET /api/rules/countries — list available countries in the database
router.get('/countries', (req, res) => {
  const db = getDb();
  const countries = db.prepare('SELECT DISTINCT country FROM local_rules ORDER BY country').all().map(r => r.country);
  res.json(countries);
});

// GET /api/rules/states?country=India
router.get('/states', (req, res) => {
  const { country } = req.query;
  if (!country) return res.status(400).json({ error: 'country is required' });
  const db = getDb();
  const states = db.prepare('SELECT DISTINCT state FROM local_rules WHERE country = ? AND state != "" ORDER BY state').all(country).map(r => r.state);
  res.json(states);
});

// GET /api/rules/cities?country=India&state=Maharashtra
router.get('/cities', (req, res) => {
  const { country, state } = req.query;
  if (!country) return res.status(400).json({ error: 'country is required' });
  const db = getDb();
  const cities = db.prepare('SELECT DISTINCT city FROM local_rules WHERE country = ? AND (state = ? OR state = "") AND city != "" ORDER BY city')
    .all(country, state || '').map(r => r.city);
  res.json(cities);
});

module.exports = router;
