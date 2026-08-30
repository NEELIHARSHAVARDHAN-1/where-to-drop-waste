const express = require('express');
const { getDb } = require('../database/db');
const router = express.Router();

// GET /api/waste-items?category=Plastic&search=bottle
router.get('/', (req, res) => {
  const db = getDb();
  const { category, search, recyclable } = req.query;

  let query = 'SELECT * FROM waste_items WHERE 1=1';
  const params = [];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (recyclable) { query += ' AND recyclable = ?'; params.push(recyclable); }
  if (search) {
    query += ' AND (name LIKE ? OR aliases LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY name ASC';

  const items = db.prepare(query).all(...params);
  res.json(items);
});

// GET /api/waste-items/categories — list all unique categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT DISTINCT category FROM waste_items ORDER BY category').all().map(r => r.category);
  res.json(cats);
});

// GET /api/waste-items/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM waste_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Waste item not found' });
  res.json(item);
});

module.exports = router;
