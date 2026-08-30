/**
 * Impact Calculation Service
 * 
 * Estimates environmental savings from proper waste segregation.
 * 
 * DISCLAIMER: All figures are ESTIMATES based on industry averages.
 * Actual impact depends on local recycling infrastructure, processing methods,
 * and material quality. These should be treated as illustrative approximations.
 * 
 * Sources used for conversion factors (averages):
 * - EPA waste reduction facts
 * - WRAP (Waste and Resources Action Programme) reports
 * - Various lifecycle assessment studies
 */

// ─── CONVERSION FACTORS ───────────────────────────────────────────────────────
// Units: CO2 in grams per gram of material, water in mL per gram, energy in Wh per gram
const IMPACT_FACTORS = {
  'Paper/Cardboard': {
    co2_per_gram: 0.9,      // gCO2 saved per gram recycled vs virgin production
    water_per_gram: 26.5,   // mL water saved per gram
    energy_per_gram: 4.1,   // Wh energy saved per gram
  },
  'Plastic': {
    co2_per_gram: 1.5,
    water_per_gram: 170.0,
    energy_per_gram: 5.8,
  },
  'Glass': {
    co2_per_gram: 0.31,
    water_per_gram: 1.2,
    energy_per_gram: 2.5,
  },
  'Metal': {
    co2_per_gram: 4.5,      // averaged across aluminium and steel
    water_per_gram: 25.0,
    energy_per_gram: 8.5,
  },
  'Organic/Wet Waste': {
    co2_per_gram: 0.5,      // methane reduction from composting vs landfill
    water_per_gram: 5.0,
    energy_per_gram: 0.5,
  },
  'E-waste': {
    co2_per_gram: 3.0,      // significant due to rare earth element recovery
    water_per_gram: 200.0,
    energy_per_gram: 100.0,
  },
  'Textile': {
    co2_per_gram: 5.0,      // high due to cotton/synthetic production impacts
    water_per_gram: 2700.0, // cotton is extremely water-intensive
    energy_per_gram: 15.0,
  },
  'Hazardous Waste': {
    co2_per_gram: 0.1,      // minimal recycling benefit; value in safe disposal
    water_per_gram: 0.5,
    energy_per_gram: 0.2,
  },
  'Sanitary Waste': {
    co2_per_gram: 0.0,
    water_per_gram: 0.0,
    energy_per_gram: 0.0,
  },
  'Non-recyclable/General Waste': {
    co2_per_gram: 0.0,
    water_per_gram: 0.0,
    energy_per_gram: 0.0,
  },
  'Unknown': {
    co2_per_gram: 0.2,      // conservative estimate
    water_per_gram: 5.0,
    energy_per_gram: 1.0,
  },
};

function calculateImpact(category, weightGrams) {
  const factors = IMPACT_FACTORS[category] || IMPACT_FACTORS['Unknown'];
  const weight = parseFloat(weightGrams) || 100;

  return {
    weight_grams: weight,
    co2_saved_grams: Math.round(factors.co2_per_gram * weight * 10) / 10,
    water_saved_ml: Math.round(factors.water_per_gram * weight),
    energy_saved_wh: Math.round(factors.energy_per_gram * weight * 10) / 10,
    disclaimer: 'These are estimated values based on industry averages and should be treated as illustrative approximations. Actual impact varies by location and local recycling infrastructure.',
  };
}

function formatImpactForDisplay(impact) {
  const co2_kg = impact.co2_saved_grams / 1000;
  const water_liters = impact.water_saved_ml / 1000;
  const energy_kwh = impact.energy_saved_wh / 1000;

  return {
    co2: co2_kg < 1 ? `${impact.co2_saved_grams}g CO₂` : `${co2_kg.toFixed(2)}kg CO₂`,
    water: water_liters < 1 ? `${impact.water_saved_ml}mL` : `${water_liters.toFixed(2)}L`,
    energy: energy_kwh < 1 ? `${impact.energy_saved_wh}Wh` : `${energy_kwh.toFixed(2)}kWh`,
  };
}

function aggregateImpacts(impacts) {
  return impacts.reduce((acc, i) => ({
    total_items: acc.total_items + 1,
    total_weight_grams: acc.total_weight_grams + (i.weight_grams || 0),
    total_co2_saved_grams: acc.total_co2_saved_grams + (i.co2_saved_grams || 0),
    total_water_saved_ml: acc.total_water_saved_ml + (i.water_saved_ml || 0),
    total_energy_saved_wh: acc.total_energy_saved_wh + (i.energy_saved_wh || 0),
  }), {
    total_items: 0,
    total_weight_grams: 0,
    total_co2_saved_grams: 0,
    total_water_saved_ml: 0,
    total_energy_saved_wh: 0,
  });
}

module.exports = { calculateImpact, formatImpactForDisplay, aggregateImpacts, IMPACT_FACTORS };
