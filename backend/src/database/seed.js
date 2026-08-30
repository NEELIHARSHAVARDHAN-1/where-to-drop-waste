const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

function seedDatabase(db) {
  // Only seed if no data exists
  const existing = db.prepare('SELECT COUNT(*) as count FROM waste_items').get();
  if (existing && (existing.count > 0)) return;

  console.log('🌱 Seeding database with demo data...');

  seedWasteItems(db);
  seedBadges(db);
  seedChallenges(db);
  seedLocalRules(db);
  seedEcoTips(db);
  seedDemoUsers(db);

  console.log('✅ Demo data seeded successfully');
}

function insertItem(db, sql, values) {
  try {
    db.prepare(sql).run(...values);
  } catch (e) {
    // Ignore duplicate key errors
    if (!e.message || !e.message.includes('UNIQUE constraint failed')) {
      // Only throw if it's not a duplicate
    }
  }
}

function seedWasteItems(db) {
  const sql = `INSERT OR IGNORE INTO waste_items 
    (id, name, aliases, category, recyclable, bin_color, bin_label, disposal_method, preparation_instructions, sustainability_info, estimated_weight_grams, co2_factor, water_factor, energy_factor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const items = [
    [uuidv4(), 'Newspaper', '["paper","news","daily"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Place in dry waste/recycling bin. Bundle newspapers together if possible.', 'Keep dry. Remove plastic wrapping.', 'Recycling 1 ton of newspaper saves 17 trees and 7,000 gallons of water.', 250, 0.9, 26.5, 4.1],
    [uuidv4(), 'Cardboard Box', '["carton","packaging","box","corrugated"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Flatten and place in recycling bin.', 'Remove tape, staples, and polystyrene. Flatten completely.', 'Cardboard is one of the most recycled materials globally.', 400, 0.9, 26.5, 4.1],
    [uuidv4(), 'Pizza Box', '["pizza","greasy box","food box"]', 'Paper/Cardboard', 'conditional', 'blue', 'Dry/Recyclable Waste (if clean)', 'Recycle only if clean. Discard greasy portions in wet/organic waste.', 'Remove food residue. Tear off clean top portion for recycling, compost the greasy bottom.', 'Grease contaminates recycling. When in doubt, compost or bin the greasy parts.', 300, 0.7, 20.0, 3.0],
    [uuidv4(), 'Magazine', '["glossy paper","brochure","catalogue"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Place in paper recycling bin.', 'Keep dry. Remove plastic covers/bags.', 'Glossy paper is recyclable in most facilities.', 200, 0.9, 26.5, 4.1],
    [uuidv4(), 'Paper Cup', '["coffee cup","disposable cup"]', 'Paper/Cardboard', 'conditional', 'grey', 'General Waste (most areas)', 'Most paper cups have a plastic lining — check local rules. Usually goes in general waste.', 'Empty any liquids. Remove plastic lid separately.', 'Paper cups are tricky to recycle due to their plastic lining. Consider reusable cups!', 15, 0.4, 10.0, 1.5],
    [uuidv4(), 'Tetra Pak', '["juice box","tetra pack","milk carton","aseptic packaging","juice carton"]', 'Paper/Cardboard', 'yes', 'blue', 'Dry/Recyclable Waste', 'Empty, rinse, and flatten. Recycle in appropriate bin.', 'Empty and rinse. Flatten and recap if possible.', 'Tetra Paks are multi-layer but increasingly recyclable. Check local facility acceptance.', 50, 0.8, 22.0, 3.5],
    [uuidv4(), 'Plastic Water Bottle', '["PET bottle","water bottle","drinking bottle","mineral water bottle","plastic bottle"]', 'Plastic', 'yes', 'blue', 'Dry/Recyclable Waste', 'Empty, crush, and recycle. Check for resin code (usually #1 PET).', 'Remove lid (recycle separately if possible), rinse, crush to save space.', 'PET bottles can be recycled into polyester fiber. Better yet, use a reusable bottle!', 30, 1.5, 170.0, 5.8],
    [uuidv4(), 'Plastic Bag', '["polybag","shopping bag","carry bag","grocery bag","poly bag"]', 'Plastic', 'conditional', 'grey', 'Special Collection/General Waste', 'Many facilities do not accept plastic bags curbside — take to store drop-off. Avoid single-use bags.', 'Clean and dry. Check for film plastic drop-off programs.', 'Plastic bags take 500+ years to decompose. Switch to cloth bags!', 10, 1.2, 60.0, 4.0],
    [uuidv4(), 'Styrofoam', '["foam","polystyrene","thermocol","packing foam","EPS"]', 'Plastic', 'no', 'grey', 'General Waste', 'Most curbside programs do not accept EPS. Seek specialized drop-offs or reuse for packing.', 'Keep clean and dry. Look for specialized EPS recyclers in your area.', 'EPS is difficult and expensive to recycle. Avoid purchasing products packaged in it.', 50, 0.0, 0.0, 0.0],
    [uuidv4(), 'Plastic Container', '["tupperware","food container","storage box","tiffin box"]', 'Plastic', 'conditional', 'blue', 'Dry/Recyclable Waste (check resin code)', 'Check the resin code. #1, #2, #5 are widely recyclable. Others may not be.', 'Wash out food residue. Check bottom for recycling number.', 'Reusable containers prevent thousands of single-use items from landfill.', 200, 1.2, 100.0, 4.0],
    [uuidv4(), 'Straw', '["plastic straw","drinking straw"]', 'Plastic', 'no', 'grey', 'General Waste', 'Place in general waste. Too small for most recycling machines.', 'Do not place in recycling — they jam sorting machinery.', 'Switch to paper, bamboo, or metal straws. Plastic straws often end up in oceans.', 2, 0.0, 0.0, 0.0],
    [uuidv4(), 'Glass Bottle', '["wine bottle","beer bottle","sauce bottle","glass jar","bottle"]', 'Glass', 'yes', 'green', 'Glass/Recyclable Waste', 'Rinse and place in glass recycling bin. Remove metal lids.', 'Remove lid/cap. Rinse out residue. No need to remove labels.', 'Glass can be recycled infinitely without quality loss. Saves energy and raw materials.', 350, 0.31, 1.2, 2.5],
    [uuidv4(), 'Broken Glass', '["shattered glass","glass shards","broken mirror"]', 'Glass', 'conditional', 'grey', 'Carefully in General Waste', 'Wrap carefully in newspaper and tape securely. Label "BROKEN GLASS". Place in general waste unless your area has a glass drop-off.', 'Wrap in several layers of newspaper. Seal with tape. Write BROKEN GLASS on the outside.', 'Broken glass poses safety risks. Wrap safely before disposal.', 200, 0.2, 0.8, 1.5],
    [uuidv4(), 'Aluminium Can', '["soda can","beer can","tin can","beverage can","coke can","aluminium can"]', 'Metal', 'yes', 'blue', 'Dry/Recyclable Waste', 'Rinse and crush. Place in metal/recycling bin.', 'Rinse out. Crush to save space if desired.', 'Recycling aluminium uses 95% less energy than making it from raw ore!', 15, 9.1, 40.0, 14.0],
    [uuidv4(), 'Steel Can', '["food can","soup can","tin","tuna can","tin can"]', 'Metal', 'yes', 'blue', 'Dry/Recyclable Waste', 'Empty and rinse. Place in metal/recycling bin.', 'Remove food residue. Labels can stay on.', 'Steel cans are the most recycled packaging material worldwide.', 60, 1.5, 10.0, 3.5],
    [uuidv4(), 'Aluminium Foil', '["foil","kitchen foil","tin foil","baking foil"]', 'Metal', 'conditional', 'blue', 'Dry/Recyclable Waste (if clean)', 'Recycle only if clean. Scrunch into a ball to keep together in recycling stream.', 'Remove food residue. Scrunch multiple pieces into a ball larger than a fist.', 'Clean foil is recyclable. Contaminated foil is not.', 10, 5.0, 20.0, 7.0],
    [uuidv4(), 'Scrap Metal', '["iron scrap","copper wire","metal parts","old metal"]', 'Metal', 'yes', 'blue', 'Metal Scrap/Kabadiwala', 'Sell to scrap dealers or take to metal recycling center.', 'Separate different metal types if possible.', 'Metal recycling conserves natural resources and reduces greenhouse gas emissions.', 500, 2.0, 15.0, 5.0],
    [uuidv4(), 'Food Scraps', '["kitchen waste","food waste","leftovers","vegetable peels","fruit peels","organic waste"]', 'Organic/Wet Waste', 'yes', 'green', 'Wet/Organic Waste (Compost)', 'Place in wet waste bin for composting. Ideal for home composting.', 'Separate from dry waste. Can be composted at home or sent to municipal composting.', 'Composting food waste returns nutrients to soil and reduces methane from landfills.', 300, 0.5, 5.0, 0.5],
    [uuidv4(), 'Garden Waste', '["leaves","grass clippings","plant trimmings","branches","dead plants"]', 'Organic/Wet Waste', 'yes', 'green', 'Wet/Organic Waste (Compost)', 'Compost or use as mulch. Place in green bin for collection.', 'Break larger branches into smaller pieces. Mix with kitchen waste for better compost.', 'Garden compost enriches soil and reduces the need for chemical fertilizers.', 500, 0.3, 3.0, 0.3],
    [uuidv4(), 'Cooked Food', '["leftover food","cooked meal","stale food","old food","leftover"]', 'Organic/Wet Waste', 'yes', 'green', 'Wet/Organic Waste', 'Place in wet waste bin. Avoid flushing down drain.', 'Drain excess liquids. Avoid mixing with dry waste.', 'Cooked food waste can be composted in municipal or vermicomposting systems.', 200, 0.4, 4.0, 0.4],
    [uuidv4(), 'Mobile Phone', '["smartphone","cell phone","old phone","broken phone"]', 'E-waste', 'yes', 'yellow', 'E-waste Collection Point', 'Take to authorized e-waste collection center. Many manufacturers have take-back programs.', 'Wipe personal data before disposal. Remove SIM card and SD card.', 'Mobile phones contain gold, silver, copper. Recycling 1 million phones recovers 35kg gold!', 150, 3.0, 200.0, 100.0],
    [uuidv4(), 'Battery', '["AA battery","AAA battery","lithium battery","old batteries","dead battery"]', 'E-waste', 'yes', 'yellow', 'Battery Drop-off / E-waste', 'Never put in regular bins. Take to battery drop-off points (often at supermarkets/electronics stores).', 'Tape terminals of lithium batteries. Do not puncture or crush.', 'Batteries contain toxic chemicals. Proper disposal prevents soil and water contamination.', 25, 1.0, 50.0, 20.0],
    [uuidv4(), 'Laptop', '["old laptop","broken laptop","computer","notebook computer"]', 'E-waste', 'yes', 'yellow', 'E-waste Collection Point', 'Donate if functional. Take to certified e-waste recycler otherwise.', 'Wipe all personal data. Remove the battery if possible.', 'Laptops contain rare earth elements that are energy-intensive to mine. Donation extends lifespan.', 2000, 5.0, 300.0, 200.0],
    [uuidv4(), 'Fluorescent Bulb', '["tubelight","CFL","fluorescent tube","compact fluorescent","CFL bulb"]', 'E-waste', 'yes', 'yellow', 'E-waste / Hazardous Waste', 'Take to e-waste or hazardous waste collection. Contains mercury.', 'Handle carefully to avoid breakage. Place in original packaging or wrap in newspaper.', 'CFLs contain mercury — never crush or put in regular bins. LED alternatives are safer.', 80, 0.5, 20.0, 10.0],
    [uuidv4(), 'Paint Can', '["paint","house paint","leftover paint","spray paint"]', 'Hazardous Waste', 'conditional', 'red', 'Hazardous Waste Collection', 'Take to hazardous waste facility. Never pour down drain.', 'Allow unused paint to dry before disposal if no facility nearby. Keep original container.', 'Leftover paint can be donated to community projects or taken to paint recycling programs.', 1000, 0.0, 0.0, 0.0],
    [uuidv4(), 'Pesticide Container', '["insecticide","herbicide","chemical container"]', 'Hazardous Waste', 'no', 'red', 'Hazardous Waste Collection', 'Triple-rinse and take to hazardous waste collection. Never in regular bins.', 'Triple rinse. Keep original label on. Seal tightly.', 'Chemical containers require special handling. Contact local authority for collection events.', 300, 0.0, 0.0, 0.0],
    [uuidv4(), 'Motor Oil', '["engine oil","used oil","lubricating oil"]', 'Hazardous Waste', 'yes', 'red', 'Oil Recycling / Hazardous Waste', 'Take to auto shops or oil recycling centers. Never pour on ground or drain.', 'Store in sealed container. Do not mix with water or other fluids.', '4 liters of motor oil can contaminate 1 million liters of water. Always recycle properly.', 1000, 0.0, 0.0, 5.0],
    [uuidv4(), 'Old Clothes', '["clothing","garments","worn clothes","rags","T-shirt","shirt","jeans"]', 'Textile', 'yes', 'blue', 'Textile Donation / Recycling', 'Donate to NGOs, charity shops, or textile recyclers. Do not put in regular bins.', 'Wash before donating. Place in donation bags at collection points.', 'The fashion industry is one of the largest polluters. Extending clothes life reduces impact.', 400, 5.0, 2700.0, 15.0],
    [uuidv4(), 'Shoes', '["footwear","sandals","boots","sneakers","slippers"]', 'Textile', 'yes', 'blue', 'Textile/Shoe Donation', 'Donate to charities or shoe recycling programs. Some brands accept old shoes.', 'Pair and bag together. Clean before donating.', 'Nike and other brands have shoe recycling programs turning old soles into new sports surfaces.', 500, 3.0, 1500.0, 10.0],
    [uuidv4(), 'Diaper', '["nappy","baby diaper","adult diaper"]', 'Sanitary Waste', 'no', 'grey', 'Sanitary/General Waste', 'Wrap tightly and place in sealed bag. Put in general waste.', 'Fold and wrap in a plastic bag. Seal securely. Never flush.', 'Single-use diapers take 500 years to decompose. Cloth diapers significantly reduce waste.', 150, 0.0, 0.0, 0.0],
    [uuidv4(), 'Sanitary Pad', '["sanitary napkin","pad","menstrual pad"]', 'Sanitary Waste', 'no', 'grey', 'Sanitary/General Waste', 'Wrap in provided wrapper or newspaper. Place in sanitary bin or general waste. Never flush.', 'Wrap securely before disposal. Never flush down toilet.', 'Menstrual cups and period underwear create significantly less waste than disposable pads.', 10, 0.0, 0.0, 0.0],
    [uuidv4(), 'Chip Packet', '["crisp packet","snack wrapper","biscuit wrapper","candy wrapper"]', 'Non-recyclable/General Waste', 'no', 'grey', 'General Waste', 'Place in general waste bin. Some terracycling programs accept flexible plastics.', 'Empty and fold. Check for terracycle or special collection programs in your area.', 'Multi-layer plastic packaging is hard to recycle. Buy in bulk to reduce packaging waste.', 10, 0.0, 0.0, 0.0],
    [uuidv4(), 'Ceramic Mug', '["broken mug","china","pottery","porcelain","cup","ceramic"]', 'Non-recyclable/General Waste', 'no', 'grey', 'General Waste (or donate if intact)', 'If intact: donate. If broken: wrap and place in general waste. Not accepted by glass recyclers.', 'Wrap broken pieces safely. Label if sharp.', 'Repairing with kintsugi or mosaic can give ceramics a second life as art.', 250, 0.0, 0.0, 0.0],
    [uuidv4(), 'Medicine', '["expired medicine","tablets","capsules","drugs","pharmaceutical","pills"]', 'Hazardous Waste', 'no', 'red', 'Medicine Take-back Program', 'Return to pharmacy. Never flush down toilet or put in regular bins.', 'Keep in original container. Take to pharmacy take-back program.', 'Flushing medicines contaminates water supplies. Most pharmacies accept expired medications.', 50, 0.0, 0.0, 0.0],
    [uuidv4(), 'Rubber Tyre', '["tire","tyre","car tire","bike tyre"]', 'Non-recyclable/General Waste', 'yes', 'black', 'Tyre Recycling/Drop-off', 'Take to tyre recycler or auto shop. Never burn or landfill.', 'Remove from rim if possible. Take to dedicated tyre recycler.', 'Tyres can be recycled into playground surfaces, athletic tracks, and road surfaces.', 8000, 2.0, 50.0, 10.0],
    [uuidv4(), 'Book', '["old book","textbook","novel","notebook","used book"]', 'Paper/Cardboard', 'yes', 'blue', 'Donate or Paper Recycling', 'Donate to libraries, schools, or charities. If damaged beyond use, remove hard cover and recycle pages.', 'Hard covers may need to be removed for paper recycling.', 'Books are best donated to extend their life. One donated book can educate many more readers.', 400, 0.8, 22.0, 3.5],
  ];

  for (const item of items) {
    insertItem(db, sql, item);
  }
}

function seedBadges(db) {
  const sql = `INSERT OR IGNORE INTO badges (id, name, description, icon, criteria_type, criteria_value, points_reward) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const badges = [
    [uuidv4(), 'First Classifier', 'Classified your first waste item', '🔍', 'classifications', 1, 20],
    [uuidv4(), 'Recycling Rookie', 'Classified 10 waste items', '♻️', 'classifications', 10, 50],
    [uuidv4(), 'Waste Warrior', 'Classified 50 waste items', '⚔️', 'classifications', 50, 150],
    [uuidv4(), 'Eco Champion', 'Classified 100 waste items', '🏆', 'classifications', 100, 300],
    [uuidv4(), 'Green Streak', 'Maintained a 7-day activity streak', '🔥', 'streak', 7, 100],
    [uuidv4(), 'Consistent Sorter', 'Maintained a 30-day activity streak', '⚡', 'streak', 30, 500],
    [uuidv4(), 'Zero Waste Hero', 'Earned 500 total points', '🌍', 'points', 500, 100],
    [uuidv4(), 'Challenge Finisher', 'Completed your first community challenge', '🎯', 'challenges', 1, 75],
    [uuidv4(), 'Earth Guardian', 'Earned 1000 total points', '🌱', 'points', 1000, 200],
  ];
  for (const b of badges) insertItem(db, sql, b);
}

function seedChallenges(db) {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const sql = `INSERT OR IGNORE INTO challenges (id, title, description, challenge_type, target_value, target_unit, points_reward, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const challenges = [
    [uuidv4(), 'Plastic-Free Week', 'Avoid single-use plastics for one week. Classify and report any plastic items you successfully avoided or replaced.', 'community', 7, 'days', 200, fmt(now), fmt(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))],
    [uuidv4(), 'Recycle 20 Items', 'Classify and correctly segregate 20 recyclable items this month.', 'community', 20, 'items', 150, fmt(now), fmt(future)],
    [uuidv4(), 'Compost Champion', 'Properly compost or dispose of 15 organic waste items.', 'community', 15, 'items', 120, fmt(now), fmt(future)],
    [uuidv4(), 'E-waste Awareness', 'Classify 5 electronic waste items and learn the correct disposal method.', 'educational', 5, 'items', 100, fmt(now), fmt(future)],
    [uuidv4(), 'Zero Landfill Day', 'For one day, ensure all your waste is either recycled, composted, or donated.', 'personal', 1, 'day', 80, fmt(now), fmt(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000))],
    [uuidv4(), 'Community Cleanup', 'Participate in a local cleanup event and log items collected.', 'community', 1, 'event', 300, fmt(now), fmt(future)],
  ];
  for (const c of challenges) insertItem(db, sql, c);
}

function seedLocalRules(db) {
  const sql = `INSERT OR IGNORE INTO local_rules (id, country, state, city, category, bin_label, bin_color, collection_schedule, special_instructions, accepted_items, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const rules = [
    [uuidv4(), 'India', 'Maharashtra', 'Mumbai', 'Organic/Wet Waste', 'Green Bin (Wet Waste)', 'green', 'Daily', 'Separate wet and dry waste as per BMC mandate.', '["food scraps","vegetable peels","cooked food","garden waste"]', 'Sample data — verify with BMC for official rules.'],
    [uuidv4(), 'India', 'Maharashtra', 'Mumbai', 'Paper/Cardboard', 'Blue Bin (Dry Waste)', 'blue', 'Alternate days', 'Keep dry waste clean and dry.', '["paper","cardboard","plastic","metal","glass"]', 'Sample data — verify with BMC for official rules.'],
    [uuidv4(), 'India', 'Maharashtra', 'Mumbai', 'Plastic', 'Blue Bin (Dry Waste)', 'blue', 'Alternate days', 'Only clean, dry plastic goes in dry bin.', '["plastic bottles","plastic containers"]', 'Sample data — verify with BMC.'],
    [uuidv4(), 'India', 'Karnataka', 'Bengaluru', 'Organic/Wet Waste', 'Green Bin (Wet Waste)', 'green', 'Daily', 'BBMP mandates segregation at source. Fines apply for mixing.', '["food waste","garden waste","fruit peels"]', 'Sample data — verify with BBMP for official rules.'],
    [uuidv4(), 'India', 'Karnataka', 'Bengaluru', 'Paper/Cardboard', 'White/Blue Bin (Dry Recyclable)', 'blue', 'Alternate days', 'Clean and dry recyclables only.', '["paper","plastic","metal","glass","e-waste"]', 'Sample data — verify with BBMP.'],
    [uuidv4(), 'India', 'Delhi', 'Delhi', 'Organic/Wet Waste', 'Green Bin', 'green', 'Daily', 'MCD mandates wet/dry segregation.', '["food waste","garden waste"]', 'Sample data — verify with MCD.'],
    [uuidv4(), 'India', 'Delhi', 'Delhi', 'Paper/Cardboard', 'Blue Bin (Dry Waste)', 'blue', 'Alternate days', 'Keep dry waste separate.', '["paper","cardboard","plastic","metal"]', 'Sample data — verify with MCD.'],
    [uuidv4(), 'USA', 'California', 'San Francisco', 'Organic/Wet Waste', 'Green Bin (Compost)', 'green', 'Weekly', 'SF has mandatory composting. Food scraps go in green bin.', '["food scraps","soiled paper","garden waste"]', 'Sample data — verify with Recology/SF Environment.'],
    [uuidv4(), 'USA', 'California', 'San Francisco', 'Paper/Cardboard', 'Blue Bin (Recycling)', 'blue', 'Weekly', 'Clean recyclables only. No greasy containers.', '["paper","cardboard","plastic 1-7","glass","metal cans"]', 'Sample data — verify with Recology.'],
    [uuidv4(), 'UK', 'England', 'London', 'Paper/Cardboard', 'Blue/Black Recycling Bin', 'blue', 'Fortnightly', 'Rules vary by borough. Check your council website.', '["paper","cardboard","plastic bottles","glass","tins"]', 'Sample data — verify with your local London borough council.'],
    [uuidv4(), 'Germany', 'Bavaria', 'Munich', 'Paper/Cardboard', 'Blue Bin (Altpapier)', 'blue', 'Fortnightly', 'Germany has strict waste separation rules (Mulltrennung).', '["paper","cardboard","newspapers","magazines"]', 'Sample data — verify with Munich Stadtwerke.'],
    [uuidv4(), 'Germany', 'Bavaria', 'Munich', 'Plastic', 'Yellow Bin (Gelber Sack)', 'yellow', 'Fortnightly', 'All packaging with the Green Dot symbol goes in yellow bin.', '["plastic packaging","metal packaging","composite packaging"]', 'Sample data — verify with Munich Stadtwerke.'],
  ];
  for (const r of rules) insertItem(db, sql, r);
}

function seedEcoTips(db) {
  const sql = `INSERT OR IGNORE INTO eco_tips (id, category, title, content, tip_type) VALUES (?, ?, ?, ?, ?)`;
  const tips = [
    [uuidv4(), 'reduce', 'Buy in Bulk', 'Buying in bulk reduces packaging waste and often saves money. Bring your own reusable containers to bulk stores.', 'daily'],
    [uuidv4(), 'reuse', 'Repurpose Glass Jars', 'Old glass jars make excellent storage containers for grains, spices, or leftovers. Clean and reuse before recycling.', 'daily'],
    [uuidv4(), 'recycle', 'Clean Before Recycling', 'Contaminated recycling can spoil entire batches. A quick rinse makes a huge difference in recycling quality.', 'daily'],
    [uuidv4(), 'fact', 'Aluminium Magic', 'Recycling one aluminium can saves enough energy to run a TV for 3 hours. Aluminium can be recycled infinitely without quality loss.', 'eco_fact'],
    [uuidv4(), 'reduce', 'Say No to Single-Use', 'Carry a reusable bag, bottle, and coffee cup. These three swaps can eliminate thousands of single-use items over your lifetime.', 'daily'],
    [uuidv4(), 'compost', 'Start Composting', 'Home composting can divert 30% of household waste from landfill. Even a small balcony composting bin makes a difference.', 'daily'],
    [uuidv4(), 'fact', 'Plastic in Oceans', 'Over 8 million tons of plastic enters the oceans every year. By 2050, plastic in oceans could outweigh all fish.', 'eco_fact'],
    [uuidv4(), 'upcycle', 'T-shirt to Tote Bag', 'An old T-shirt can be easily transformed into a reusable tote bag with no sewing required. Search online for simple tutorials.', 'diy'],
    [uuidv4(), 'fact', 'Paper Recycling Impact', 'Recycling one ton of paper saves 17 mature trees, 380 gallons of oil, and 7,000 gallons of water.', 'eco_fact'],
    [uuidv4(), 'reduce', 'Food Waste Fight', 'Plan your meals and make a shopping list. One-third of all food produced globally is wasted. Reducing food waste is one of the most impactful climate actions.', 'daily'],
    [uuidv4(), 'reuse', 'Repair Before Replace', 'Before throwing out a broken item, search for a repair guide. Many items can be fixed, saving money and reducing waste.', 'daily'],
    [uuidv4(), 'fact', 'Glass Recycling', 'Glass can be recycled endlessly without losing quality. Every ton of recycled glass saves over a ton of raw materials.', 'eco_fact'],
    [uuidv4(), 'ewaste', 'E-waste Responsibility', 'Only 20% of global e-waste is formally recycled. Take old electronics to certified e-waste recyclers — they contain valuable and toxic materials.', 'daily'],
    [uuidv4(), 'upcycle', 'Bottle Planter', 'Plastic bottles can become vertical garden planters. Cut them horizontally, fill with soil, and grow herbs or flowers.', 'diy'],
    [uuidv4(), 'reduce', 'Digital First', 'Choose digital receipts, bills, and statements. Switching from paper bills to digital saves significant paper per household each year.', 'daily'],
  ];
  for (const t of tips) insertItem(db, sql, t);
}

function seedDemoUsers(db) {
  const sql = `INSERT OR IGNORE INTO users (id, name, email, password_hash, points, recycling_score, streak_days, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const hash = bcrypt.hashSync('Demo@123', 10);
  const users = [
    [uuidv4(), 'Priya Sharma', 'priya@demo.com', hash, 1250, 92, 15, 5],
    [uuidv4(), 'Alex Chen', 'alex@demo.com', hash, 980, 85, 8, 4],
    [uuidv4(), 'Maria Santos', 'maria@demo.com', hash, 875, 78, 12, 4],
    [uuidv4(), 'James Okonkwo', 'james@demo.com', hash, 720, 71, 5, 3],
    [uuidv4(), 'Emma Wilson', 'emma@demo.com', hash, 640, 68, 3, 3],
    [uuidv4(), 'Raj Patel', 'raj@demo.com', hash, 550, 60, 2, 2],
    [uuidv4(), 'Sophie Laurent', 'sophie@demo.com', hash, 430, 55, 1, 2],
    [uuidv4(), 'Demo User', 'demo@wasteseg.app', hash, 120, 45, 0, 1],
  ];
  for (const u of users) insertItem(db, sql, u);
}

module.exports = { seedDatabase };
