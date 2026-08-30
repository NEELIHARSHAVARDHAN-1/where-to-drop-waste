/**
 * Gamification Service
 * Handles points, levels, badges, and streaks.
 */

const { getDb } = require('../database/db');
const { v4: uuidv4 } = require('uuid');

// ─── POINTS CONFIGURATION ─────────────────────────────────────────────────────
const POINTS = {
  CLASSIFY_ITEM: 10,
  CORRECT_SEGREGATION: 15,
  USER_CORRECTION_SUBMITTED: 5,
  COMPLETE_QUIZ: 25,
  COMPLETE_CHALLENGE: 100,  // base; actual from challenge row
  ECO_FACT_READ: 3,
  DAILY_LOGIN: 5,
  FIRST_CLASSIFICATION: 20,
};

// ─── LEVEL THRESHOLDS ─────────────────────────────────────────────────────────
const LEVELS = [
  { level: 1, min: 0, title: 'Waste Novice' },
  { level: 2, min: 100, title: 'Recycling Learner' },
  { level: 3, min: 300, title: 'Eco Practitioner' },
  { level: 4, min: 600, title: 'Green Champion' },
  { level: 5, min: 1000, title: 'Sustainability Hero' },
  { level: 6, min: 1500, title: 'Earth Guardian' },
  { level: 7, min: 2500, title: 'Waste Warrior' },
  { level: 8, min: 4000, title: 'Planet Protector' },
];

function getLevelFromPoints(points) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

function getNextLevel(currentPoints) {
  const currentLevel = getLevelFromPoints(currentPoints);
  const next = LEVELS.find(l => l.level === currentLevel.level + 1);
  return next || null;
}

function awardPoints(userId, action, extra = 0) {
  const db = getDb();
  const pointsEarned = (POINTS[action] || 0) + extra;
  if (pointsEarned <= 0) return { pointsEarned: 0 };

  const user = db.prepare('SELECT points, level, streak_days FROM users WHERE id = ?').get(userId);
  if (!user) return { pointsEarned: 0 };

  const newPoints = (user.points || 0) + pointsEarned;
  const newLevel = getLevelFromPoints(newPoints);
  const leveledUp = newLevel.level > (user.level || 1);

  db.prepare('UPDATE users SET points = ?, level = ? WHERE id = ?').run(newPoints, newLevel.level, userId);

  // Check badges
  const newBadges = checkAndAwardBadges(userId, db);

  return {
    pointsEarned,
    totalPoints: newPoints,
    level: newLevel,
    leveledUp,
    newBadges,
  };
}

function checkAndAwardBadges(userId, db) {
  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
  const allBadges = db.prepare('SELECT * FROM badges').all();
  const userBadges = db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId).map(r => r.badge_id);
  const classificationCount = db.prepare('SELECT COUNT(*) as count FROM classifications WHERE user_id = ?').get(userId)?.count || 0;
  const streakDays = db.prepare('SELECT streak_days FROM users WHERE id = ?').get(userId)?.streak_days || 0;
  const completedChallenges = db.prepare('SELECT COUNT(*) as count FROM user_challenges WHERE user_id = ? AND completed = 1').get(userId)?.count || 0;

  const newlyEarned = [];

  for (const badge of allBadges) {
    if (userBadges.includes(badge.id)) continue;

    let earned = false;
    switch (badge.criteria_type) {
      case 'classifications': earned = classificationCount >= badge.criteria_value; break;
      case 'points': earned = user.points >= badge.criteria_value; break;
      case 'streak': earned = streakDays >= badge.criteria_value; break;
      case 'challenges': earned = completedChallenges >= badge.criteria_value; break;
      default: break;
    }

    if (earned) {
      db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(badge.points_reward, userId);
      newlyEarned.push(badge);
    }
  }

  return newlyEarned;
}

function updateStreak(userId) {
  const db = getDb();
  const user = db.prepare('SELECT streak_days, last_activity_date FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const today = new Date().toISOString().split('T')[0];
  const lastDate = user.last_activity_date;

  if (lastDate === today) return; // already logged today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newStreak = lastDate === yesterday ? (user.streak_days || 0) + 1 : 1;

  db.prepare('UPDATE users SET streak_days = ?, last_activity_date = ? WHERE id = ?').run(newStreak, today, userId);
}

function getUserStats(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const classificationCount = db.prepare('SELECT COUNT(*) as count FROM classifications WHERE user_id = ?').get(userId)?.count || 0;
  const badges = db.prepare(`
    SELECT b.* FROM badges b 
    JOIN user_badges ub ON b.id = ub.badge_id 
    WHERE ub.user_id = ?
    ORDER BY ub.earned_at DESC
  `).all(userId);

  const level = getLevelFromPoints(user.points || 0);
  const nextLevel = getNextLevel(user.points || 0);

  return {
    ...user,
    level_info: level,
    next_level: nextLevel,
    progress_to_next: nextLevel
      ? Math.round(((user.points - level.min) / (nextLevel.min - level.min)) * 100)
      : 100,
    classification_count: classificationCount,
    badges,
  };
}

module.exports = { awardPoints, checkAndAwardBadges, updateStreak, getUserStats, getLevelFromPoints, POINTS, LEVELS };
