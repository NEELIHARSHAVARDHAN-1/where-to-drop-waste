/**
 * Appwrite-backed Gamification Service
 *
 * Handles points, levels, streaks, badges for both Appwrite and SQLite modes.
 *
 * SECURITY: All point calculations happen here on the server.
 *           The browser never sets points directly.
 */

'use strict';

const { sdk, getDatabases, DATABASE_ID, COLLECTIONS, USE_APPWRITE } = require('../config/appwrite');
const { v4: uuidv4 } = require('uuid');

// ─── POINTS CONFIGURATION ─────────────────────────────────────────────────────
const POINTS = {
  CLASSIFY_ITEM: 10,
  CORRECT_SEGREGATION: 15,
  USER_CORRECTION_SUBMITTED: 5,
  COMPLETE_QUIZ: 25,
  COMPLETE_CHALLENGE: 100, // base; actual from challenge row
  ECO_FACT_READ: 3,
  DAILY_LOGIN: 5,
  FIRST_CLASSIFICATION: 20,
};

// ─── LEVEL THRESHOLDS ─────────────────────────────────────────────────────────
const LEVELS = [
  { level: 1, min: 0,    title: 'Waste Novice' },
  { level: 2, min: 100,  title: 'Recycling Learner' },
  { level: 3, min: 300,  title: 'Eco Practitioner' },
  { level: 4, min: 600,  title: 'Green Champion' },
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
  return LEVELS.find(l => l.level === currentLevel.level + 1) || null;
}

// ─── Award points ─────────────────────────────────────────────────────────────

async function awardPoints(userId, action, extra = 0) {
  if (!USE_APPWRITE) return _awardPointsSQLite(userId, action, extra);

  const pointsEarned = (POINTS[action] || 0) + extra;
  if (pointsEarned <= 0) return { pointsEarned: 0 };

  const db = getDatabases();

  // Get current profile
  let profile;
  try {
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.profiles, userId);
    profile = doc;
  } catch (e) {
    return { pointsEarned: 0 };
  }

  const currentPoints = profile.points || 0;
  const newPoints = currentPoints + pointsEarned;
  const newLevel = getLevelFromPoints(newPoints);
  const leveledUp = newLevel.level > (profile.level || 1);

  await db.updateDocument(DATABASE_ID, COLLECTIONS.profiles, userId, {
    points:     newPoints,
    level:      newLevel.level,
    updated_at: new Date().toISOString(),
  });

  const newBadges = await checkAndAwardBadges(userId, newPoints);

  return {
    pointsEarned,
    totalPoints: newPoints,
    level: newLevel,
    leveledUp,
    newBadges,
  };
}

// ─── Streak update ────────────────────────────────────────────────────────────

async function updateStreak(userId) {
  if (!USE_APPWRITE) return _updateStreakSQLite(userId);

  const db = getDatabases();

  let profile;
  try {
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.profiles, userId);
    profile = doc;
  } catch { return; }

  const today = new Date().toISOString().split('T')[0];
  const lastDate = profile.last_activity_date;

  if (lastDate === today) return; // already logged today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newStreak = lastDate === yesterday ? (profile.streak_days || 0) + 1 : 1;

  await db.updateDocument(DATABASE_ID, COLLECTIONS.profiles, userId, {
    streak_days:        newStreak,
    last_activity_date: today,
    updated_at:         new Date().toISOString(),
  });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

async function checkAndAwardBadges(userId, currentPoints) {
  if (!USE_APPWRITE) return _checkBadgesSQLite(userId);

  const db = getDatabases();

  // Get all badges
  const badgesRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.badges, [
    sdk.Query.limit(100),
  ]);

  // Get user's existing badges
  const userBadgesRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_badges, [
    sdk.Query.equal('user_id', userId),
    sdk.Query.limit(100),
  ]);
  const earnedIds = new Set(userBadgesRes.documents.map(d => d.badge_id));

  // Get classification count
  let classCount = 0;
  try {
    const cRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
      sdk.Query.equal('user_id', userId),
      sdk.Query.limit(1),
    ]);
    classCount = cRes.total;
  } catch { /* ignore */ }

  // Get streak
  let streakDays = 0;
  let completedChallenges = 0;
  try {
    const p = await db.getDocument(DATABASE_ID, COLLECTIONS.profiles, userId);
    streakDays = p.streak_days || 0;
  } catch { /* ignore */ }

  try {
    const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
      sdk.Query.equal('user_id', userId),
      sdk.Query.equal('completed', true),
      sdk.Query.limit(1),
    ]);
    completedChallenges = ucRes.total;
  } catch { /* ignore */ }

  const newlyEarned = [];

  for (const badge of badgesRes.documents) {
    if (earnedIds.has(badge.$id)) continue;

    let earned = false;
    switch (badge.criteria_type) {
      case 'classifications': earned = classCount >= badge.criteria_value; break;
      case 'points':          earned = currentPoints >= badge.criteria_value; break;
      case 'streak':          earned = streakDays >= badge.criteria_value; break;
      case 'challenges':      earned = completedChallenges >= badge.criteria_value; break;
    }

    if (earned) {
      // Create user_badge record
      await db.createDocument(DATABASE_ID, COLLECTIONS.user_badges, uuidv4(), {
        user_id:   userId,
        badge_id:  badge.$id,
        earned_at: new Date().toISOString(),
      });

      // Award badge points
      if (badge.points_reward > 0) {
        await db.updateDocument(DATABASE_ID, COLLECTIONS.profiles, userId, {
          points: (currentPoints || 0) + (badge.points_reward || 0),
        });
      }

      newlyEarned.push({
        id:          badge.$id,
        name:        badge.name,
        description: badge.description,
        icon:        badge.icon,
      });
    }
  }

  return newlyEarned;
}

async function getUserStats(userId) {
  if (!USE_APPWRITE) return _getUserStatsSQLite(userId);

  const db = getDatabases();

  let profile;
  try {
    const doc = await db.getDocument(DATABASE_ID, COLLECTIONS.profiles, userId);
    profile = doc;
  } catch { return null; }

  let classificationCount = 0;
  try {
    const cRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.classifications, [
      sdk.Query.equal('user_id', userId),
      sdk.Query.limit(1),
    ]);
    classificationCount = cRes.total;
  } catch { /* ignore */ }

  let badges = [];
  try {
    const ubRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_badges, [
      sdk.Query.equal('user_id', userId),
      sdk.Query.orderDesc('earned_at'),
      sdk.Query.limit(50),
    ]);

    const badgeIds = ubRes.documents.map(d => d.badge_id);
    if (badgeIds.length > 0) {
      const bRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.badges, [
        sdk.Query.equal('$id', badgeIds),
        sdk.Query.limit(50),
      ]);
      badges = bRes.documents.map(b => ({
        id:          b.$id,
        name:        b.name,
        description: b.description,
        icon:        b.icon,
        earned_at:   ubRes.documents.find(u => u.badge_id === b.$id)?.earned_at,
      }));
    }
  } catch { /* ignore */ }

  const points = profile.points || 0;
  const level  = getLevelFromPoints(points);
  const next   = getNextLevel(points);

  return {
    id:               profile.$id,
    name:             profile.name,
    email:            profile.email,
    location_country: profile.location_country,
    location_state:   profile.location_state,
    location_city:    profile.location_city,
    user_type:        profile.user_type,
    points,
    level:            level.level,
    recycling_score:  profile.recycling_score || 0,
    streak_days:      profile.streak_days     || 0,
    last_activity_date: profile.last_activity_date,
    level_info:       level,
    next_level:       next,
    progress_to_next: next
      ? Math.round(((points - level.min) / (next.min - level.min)) * 100)
      : 100,
    classification_count: classificationCount,
    badges,
  };
}

// ─── Challenge progress ───────────────────────────────────────────────────────

async function updateChallengeProgress(userId, category) {
  if (!USE_APPWRITE) return _updateChallengeProgressSQLite(userId, category);

  const db = getDatabases();

  try {
    const ucRes = await db.listDocuments(DATABASE_ID, COLLECTIONS.user_challenges, [
      sdk.Query.equal('user_id', userId),
      sdk.Query.equal('completed', false),
      sdk.Query.limit(20),
    ]);

    for (const uc of ucRes.documents) {
      let challenge;
      try {
        const cDoc = await db.getDocument(DATABASE_ID, COLLECTIONS.challenges, uc.challenge_id);
        challenge = cDoc;
      } catch { continue; }

      // Check if challenge is still active
      if (challenge.end_date < new Date().toISOString().split('T')[0]) continue;

      const newProgress = (uc.progress || 0) + 1;

      if (newProgress >= challenge.target_value) {
        await db.updateDocument(DATABASE_ID, COLLECTIONS.user_challenges, uc.$id, {
          progress:     newProgress,
          completed:    true,
          completed_at: new Date().toISOString(),
        });
        await awardPoints(userId, 'COMPLETE_CHALLENGE', (challenge.points_reward || 100) - 100);
      } else {
        await db.updateDocument(DATABASE_ID, COLLECTIONS.user_challenges, uc.$id, {
          progress: newProgress,
        });
      }
    }
  } catch { /* ignore challenge errors */ }
}

// ─── SQLite fallbacks ─────────────────────────────────────────────────────────

function _awardPointsSQLite(userId, action, extra) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const pointsEarned = (POINTS[action] || 0) + extra;
  if (pointsEarned <= 0) return { pointsEarned: 0 };

  const user = db.prepare('SELECT points, level, streak_days FROM users WHERE id = ?').get(userId);
  if (!user) return { pointsEarned: 0 };

  const newPoints = (user.points || 0) + pointsEarned;
  const newLevel = getLevelFromPoints(newPoints);
  const leveledUp = newLevel.level > (user.level || 1);

  db.prepare('UPDATE users SET points = ?, level = ? WHERE id = ?').run(newPoints, newLevel.level, userId);
  const newBadges = _checkBadgesSQLite(userId);

  return { pointsEarned, totalPoints: newPoints, level: newLevel, leveledUp, newBadges };
}

function _updateStreakSQLite(userId) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const user = db.prepare('SELECT streak_days, last_activity_date FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const today = new Date().toISOString().split('T')[0];
  if (user.last_activity_date === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newStreak = user.last_activity_date === yesterday ? (user.streak_days || 0) + 1 : 1;
  db.prepare('UPDATE users SET streak_days = ?, last_activity_date = ? WHERE id = ?').run(newStreak, today, userId);
}

function _checkBadgesSQLite(userId) {
  const { getDb } = require('../database/db');
  const db = getDb();
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
    }
    if (earned) {
      db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(badge.points_reward, userId);
      newlyEarned.push(badge);
    }
  }
  return newlyEarned;
}

function _getUserStatsSQLite(userId) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const classificationCount = db.prepare('SELECT COUNT(*) as count FROM classifications WHERE user_id = ?').get(userId)?.count || 0;
  const badges = db.prepare(`
    SELECT b.*, ub.earned_at FROM badges b 
    JOIN user_badges ub ON b.id = ub.badge_id 
    WHERE ub.user_id = ? ORDER BY ub.earned_at DESC
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

function _updateChallengeProgressSQLite(userId, category) {
  const { getDb } = require('../database/db');
  const db = getDb();
  const activeChallenges = db.prepare(`
    SELECT uc.*, c.target_value, c.points_reward FROM user_challenges uc
    JOIN challenges c ON uc.challenge_id = c.id
    WHERE uc.user_id = ? AND uc.completed = 0 AND c.end_date >= date('now')
  `).all(userId);

  for (const uc of activeChallenges) {
    const newProgress = uc.progress + 1;
    if (newProgress >= uc.target_value) {
      db.prepare('UPDATE user_challenges SET progress = ?, completed = 1, completed_at = datetime("now") WHERE user_id = ? AND challenge_id = ?')
        .run(newProgress, userId, uc.challenge_id);
      _awardPointsSQLite(userId, 'COMPLETE_CHALLENGE', uc.points_reward - 100);
    } else {
      db.prepare('UPDATE user_challenges SET progress = ? WHERE user_id = ? AND challenge_id = ?')
        .run(newProgress, userId, uc.challenge_id);
    }
  }
}

module.exports = {
  awardPoints,
  updateStreak,
  checkAndAwardBadges,
  getUserStats,
  updateChallengeProgress,
  getLevelFromPoints,
  getNextLevel,
  POINTS,
  LEVELS,
};
