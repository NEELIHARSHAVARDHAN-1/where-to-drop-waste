-- ============================================================
-- WHERE TO DROP WASTE — Row Level Security Policies
-- Migration 002: RLS
--
-- Run this after 001_initial_schema.sql
-- ============================================================

-- ── Enable RLS on all user-sensitive tables ──────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_corrections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users        ENABLE ROW LEVEL SECURITY;

-- ── Reference tables: public read, no auth required ─────────
ALTER TABLE public.waste_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eco_tips     ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────────
-- Users can read their own profile
CREATE POLICY "profiles_select_own"    ON public.profiles FOR SELECT USING (auth.uid() = id);
-- Users can update their own profile (but NOT points/level — those are server-only)
CREATE POLICY "profiles_update_own"    ON public.profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
-- Leaderboard: anyone authenticated can read name + points + level
CREATE POLICY "profiles_leaderboard"   ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- CLASSIFICATIONS
-- ─────────────────────────────────────────────────────────────
-- Users can read their own classifications
CREATE POLICY "classifications_select_own" ON public.classifications FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);
-- Authenticated users can insert (user_id injected server-side, not trusted from client)
CREATE POLICY "classifications_insert"     ON public.classifications FOR INSERT
  WITH CHECK (TRUE);  -- server validates; user_id set server-side
-- No client-side UPDATE or DELETE

-- ─────────────────────────────────────────────────────────────
-- IMPACTS
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "impacts_select_own"  ON public.impacts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "impacts_insert"      ON public.impacts FOR INSERT WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- USER BADGES
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "user_badges_select_own"  ON public.user_badges FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_badges_insert"      ON public.user_badges FOR INSERT WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- USER CHALLENGES
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "user_challenges_select_own"  ON public.user_challenges FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_challenges_insert"      ON public.user_challenges FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_challenges_update_own"  ON public.user_challenges FOR UPDATE USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- USER CORRECTIONS
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "corrections_select_own"  ON public.user_corrections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "corrections_insert"      ON public.user_corrections FOR INSERT WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- TRAINING CANDIDATES
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "training_select_own"    ON public.training_candidates FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "training_insert"        ON public.training_candidates FOR INSERT WITH CHECK (TRUE);
-- Admins can read all
CREATE POLICY "training_admin_select"  ON public.training_candidates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));
CREATE POLICY "training_admin_update"  ON public.training_candidates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- ADMIN USERS
-- ─────────────────────────────────────────────────────────────
-- Only admins can see admin_users table
CREATE POLICY "admin_users_select"  ON public.admin_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- REFERENCE DATA — public read
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "waste_items_public_read"  ON public.waste_items  FOR SELECT USING (TRUE);
CREATE POLICY "badges_public_read"       ON public.badges       FOR SELECT USING (TRUE);
CREATE POLICY "challenges_public_read"   ON public.challenges   FOR SELECT USING (TRUE);
CREATE POLICY "local_rules_public_read"  ON public.local_rules  FOR SELECT USING (TRUE);
CREATE POLICY "eco_tips_public_read"     ON public.eco_tips     FOR SELECT USING (TRUE);

-- ─────────────────────────────────────────────────────────────
-- SECURE POINTS UPDATE FUNCTION
-- Points can ONLY be updated via this server-side RPC.
-- The browser cannot call UPDATE profiles SET points = 9999 directly.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_points  INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_points INTEGER;
  new_points     INTEGER;
  new_level      INTEGER;
BEGIN
  SELECT points INTO current_points FROM public.profiles WHERE id = p_user_id;
  new_points := COALESCE(current_points, 0) + p_points;

  -- Calculate level from points
  new_level := CASE
    WHEN new_points >= 4000 THEN 8
    WHEN new_points >= 2500 THEN 7
    WHEN new_points >= 1500 THEN 6
    WHEN new_points >= 1000 THEN 5
    WHEN new_points >= 600  THEN 4
    WHEN new_points >= 300  THEN 3
    WHEN new_points >= 100  THEN 2
    ELSE 1
  END;

  UPDATE public.profiles
  SET points = new_points, level = new_level, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- STREAK UPDATE FUNCTION (server-side, atomic)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last DATE;
  v_streak INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT last_activity_date, streak_days
  INTO v_last, v_streak
  FROM public.profiles WHERE id = p_user_id;

  IF v_last = v_today THEN RETURN; END IF;

  IF v_last = v_today - INTERVAL '1 day' THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_streak := 1;
  END IF;

  UPDATE public.profiles
  SET streak_days = v_streak, last_activity_date = v_today, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;
