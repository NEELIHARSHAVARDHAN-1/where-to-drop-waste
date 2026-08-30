/**
 * Locations API
 *
 * Serves India state/city data from the centralized data file.
 * Also supports reverse geocoding via Nominatim (free, no API key required).
 */

const express = require('express');
const path = require('path');
const https = require('https');

const router = express.Router();

// Load India location data once
const INDIA_DATA = require('../../data/india_locations.json');

// Build a quick lookup map: stateName → { type, cities[] }
const STATE_MAP = {};
for (const s of INDIA_DATA.states) {
  STATE_MAP[s.name] = s;
}

// ─── GET /api/locations/india ─────────────────────────────────────────────────
// Returns full India state/UT + cities dataset
router.get('/india', (req, res) => {
  res.json(INDIA_DATA);
});

// ─── GET /api/locations/india/states ─────────────────────────────────────────
router.get('/india/states', (req, res) => {
  const states = INDIA_DATA.states.map(s => ({
    name: s.name,
    type: s.type,
  }));
  res.json(states);
});

// ─── GET /api/locations/india/cities?state=Maharashtra ───────────────────────
router.get('/india/cities', (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).json({ error: 'state query parameter is required' });

  const stateData = STATE_MAP[state];
  if (!stateData) return res.status(404).json({ error: `State "${state}" not found` });

  res.json({ state: stateData.name, type: stateData.type, cities: stateData.cities });
});

// ─── GET /api/locations/reverse-geocode?lat=...&lon=... ──────────────────────
// Uses Nominatim (OpenStreetMap) for reverse geocoding.
// Privacy: coordinates are only used for this lookup and not stored.
router.get('/reverse-geocode', (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required' });

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Coordinates out of range' });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;

  const options = {
    headers: {
      'User-Agent': 'WhereToDropWaste/2.0 (waste-segregation-app)',
      'Accept-Language': 'en',
    },
  };

  https.get(url, options, (response) => {
    let data = '';
    response.on('data', chunk => { data += chunk; });
    response.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const address = parsed.address || {};

        // Extract country, state, city from Nominatim response
        const country = address.country || null;
        const state = address.state || address.province || address.region || null;

        // City is the most specific available locality
        const city = address.city || address.town || address.village ||
          address.county || address.suburb || null;

        if (!country) {
          return res.json({ success: false, error: 'Could not determine location from coordinates.' });
        }

        // For India: try to match state name to our dataset
        let matchedState = state;
        if (country === 'India' && state) {
          const found = INDIA_DATA.states.find(
            s => s.name.toLowerCase() === state.toLowerCase() ||
              state.toLowerCase().includes(s.name.toLowerCase())
          );
          if (found) matchedState = found.name;
        }

        res.json({
          success: true,
          country,
          state: matchedState,
          city,
          raw_address: address,
          privacy_note: 'Coordinates are used only for this reverse geocoding lookup and are not stored.',
        });
      } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to parse geocoding response' });
      }
    });
  }).on('error', (e) => {
    res.status(503).json({ success: false, error: 'Geocoding service unavailable. Please select location manually.' });
  });
});

module.exports = router;
