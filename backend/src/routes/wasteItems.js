const express = require('express');
const { getWasteItems, getWasteCategories, getWasteItemById } = require('../services/wasteItemService');
const router = express.Router();

// GET /api/waste-items?category=Plastic&search=bottle
router.get('/', async (req, res) => {
  const { category, search, recyclable } = req.query;

  try {
    const items = await getWasteItems({ category, search, recyclable });
    res.json(items);
  } catch (err) {
    console.error('[WasteItems] Error fetching waste items:', err.message);
    res.status(500).json({ error: 'Failed to fetch waste items' });
  }
});

// GET /api/waste-items/categories — list all unique categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await getWasteCategories();
    res.json(categories);
  } catch (err) {
    console.error('[WasteItems] Error fetching categories:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/waste-items/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await getWasteItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Waste item not found' });
    res.json(item);
  } catch (err) {
    console.error('[WasteItems] Error fetching waste item:', err.message);
    res.status(500).json({ error: 'Failed to fetch waste item' });
  }
});

module.exports = router;
