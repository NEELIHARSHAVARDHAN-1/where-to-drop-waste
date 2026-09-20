const express = require('express');
const { getLocalRules, getCountries, getStates, getCities } = require('../services/ruleService');
const router = express.Router();

// GET /api/rules?country=India&state=Maharashtra&city=Mumbai
router.get('/', async (req, res) => {
  const { country, state, city, category } = req.query;
  if (!country) return res.status(400).json({ error: 'country query parameter is required' });

  try {
    const rules = await getLocalRules({ country, state, city, category });

    res.json({
      rules,
      disclaimer: '⚠️ SAMPLE DATA — These localized rules are for demonstration purposes only. Always verify with your local municipal authority for official, current waste management guidelines.',
      country,
      state: state || null,
      city: city || null,
    });
  } catch (err) {
    console.error('[Rules] Error fetching rules:', err.message);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// GET /api/rules/countries — list available countries in the database
router.get('/countries', async (req, res) => {
  try {
    const countries = await getCountries();
    res.json(countries);
  } catch (err) {
    console.error('[Rules] Error fetching countries:', err.message);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
});

// GET /api/rules/states?country=India
router.get('/states', async (req, res) => {
  const { country } = req.query;
  if (!country) return res.status(400).json({ error: 'country is required' });

  try {
    const states = await getStates(country);
    res.json(states);
  } catch (err) {
    console.error('[Rules] Error fetching states:', err.message);
    res.status(500).json({ error: 'Failed to fetch states' });
  }
});

// GET /api/rules/cities?country=India&state=Maharashtra
router.get('/cities', async (req, res) => {
  const { country, state } = req.query;
  if (!country) return res.status(400).json({ error: 'country is required' });

  try {
    const cities = await getCities(country, state);
    res.json(cities);
  } catch (err) {
    console.error('[Rules] Error fetching cities:', err.message);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

module.exports = router;
