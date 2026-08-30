const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

// GET /api/tips?type=eco_fact&count=1
router.get('/', (req, res) => {
  const db = getDb();
  const { type, category, count } = req.query;
  const limit = Math.min(parseInt(count) || 5, 20);

  let query = 'SELECT * FROM eco_tips WHERE is_active = 1';
  const params = [];
  if (type) { query += ' AND tip_type = ?'; params.push(type); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY RANDOM() LIMIT ?';
  params.push(limit);

  const tips = db.prepare(query).all(...params);
  res.json(tips);
});

// GET /api/tips/daily — one random daily tip
router.get('/daily', (req, res) => {
  const db = getDb();
  const tip = db.prepare('SELECT * FROM eco_tips WHERE is_active = 1 ORDER BY RANDOM() LIMIT 1').get();
  res.json(tip || null);
});

module.exports = router;
