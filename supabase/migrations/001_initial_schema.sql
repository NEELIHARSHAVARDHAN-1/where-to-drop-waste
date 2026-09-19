-- ============================================================
-- WHERE TO DROP WASTE — Supabase PostgreSQL Schema
-- Migration 001: Initial Schema
--
-- Run this in your Supabase project's SQL editor.
-- ============================================================

-- ── Enable UUID extension ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- PROFILES
-- Mirrors auth.users; extended with app-level fields.
-- Populated by a trigger on auth.users INSERT.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  location_country TEXT DEFAULT 'India',
  location_state   TEXT DEFAULT '',
  location_city    TEXT DEFAULT '',
  user_type     TEXT DEFAULT 'household' CHECK (user_type IN ('household','school','office','community')),
  points        INTEGER DEFAULT 0 CHECK (points >= 0),
  recycling_score REAL DEFAULT 0,
  streak_days   INTEGER DEFAULT 0,
  last_activity_date DATE,
  level         INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on new Supabase Auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- WASTE ITEMS  (reference / static data)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waste_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  aliases       JSONB DEFAULT '[]',
  category      TEXT NOT NULL,
  recyclable    TEXT NOT NULL,
  bin_color     TEXT DEFAULT 'grey',
  bin_label     TEXT DEFAULT 'General Waste',
  disposal_method TEXT NOT NULL,
  preparation_instructions TEXT DEFAULT '',
  sustainability_info TEXT DEFAULT '',
  estimated_weight_grams REAL DEFAULT 50,
  co2_factor    REAL DEFAULT 0,
  water_factor  REAL DEFAULT 0,
  energy_factor REAL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CLASSIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  input_text    TEXT,
  image_url     TEXT,
  method        TEXT NOT NULL DEFAULT 'text',
  matched_item_id UUID REFERENCES public.waste_items(id) ON DELETE SET NULL,
  category      TEXT NOT NULL,
  recyclable    TEXT NOT NULL DEFAULT 'unknown',
  disposal_method TEXT NOT NULL DEFAULT '',
  confidence    REAL DEFAULT 0,
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_correction TEXT,
  points_awarded INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classifications_user_id ON public.classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_classifications_created_at ON public.classifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classifications_category ON public.classifications(category);

-- ─────────────────────────────────────────────────────────────
-- IMPACTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.impacts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classification_id UUID REFERENCES public.classifications(id) ON DELETE SET NULL,
  waste_category    TEXT NOT NULL,
  weight_grams      REAL DEFAULT 50,
  co2_saved_grams   REAL DEFAULT 0,
  water_saved_ml    REAL DEFAULT 0,
  energy_saved_wh   REAL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impacts_user_id ON public.impacts(user_id);

-- ─────────────────────────────────────────────────────────────
-- BADGES  (reference data)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  icon           TEXT DEFAULT '🏅',
  criteria_type  TEXT NOT NULL,  -- 'classifications' | 'points' | 'streak' | 'challenges'
  criteria_value INTEGER NOT NULL,
  points_reward  INTEGER DEFAULT 50
);

-- ─────────────────────────────────────────────────────────────
-- USER BADGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id  UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- ─────────────────────────────────────────────────────────────
-- CHALLENGES  (reference + community data)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  challenge_type TEXT DEFAULT 'community',
  target_value   INTEGER NOT NULL,
  target_unit    TEXT DEFAULT 'items',
  points_reward  INTEGER DEFAULT 100,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  created_by     TEXT DEFAULT 'system',
  is_active      BOOLEAN DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────
-- USER CHALLENGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_challenges (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  progress     INTEGER DEFAULT 0,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

-- ─────────────────────────────────────────────────────────────
-- LOCAL RULES  (reference data)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.local_rules (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country              TEXT NOT NULL,
  state                TEXT DEFAULT '',
  city                 TEXT DEFAULT '',
  category             TEXT NOT NULL,
  bin_label            TEXT NOT NULL,
  bin_color            TEXT DEFAULT 'grey',
  collection_schedule  TEXT DEFAULT '',
  special_instructions TEXT DEFAULT '',
  accepted_items       JSONB DEFAULT '[]',
  rejected_items       JSONB DEFAULT '[]',
  notes                TEXT DEFAULT '',
  data_source          TEXT DEFAULT 'sample_data',
  verified             BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_local_rules_location ON public.local_rules(country, state, city);
CREATE INDEX IF NOT EXISTS idx_local_rules_category ON public.local_rules(category);

-- ─────────────────────────────────────────────────────────────
-- ECO TIPS  (reference data)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eco_tips (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  tip_type TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT TRUE
);

-- ─────────────────────────────────────────────────────────────
-- USER CORRECTIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_corrections (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classification_id    UUID REFERENCES public.classifications(id) ON DELETE SET NULL,
  user_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_category    TEXT NOT NULL,
  corrected_category   TEXT NOT NULL,
  corrected_item       TEXT,
  notes                TEXT DEFAULT '',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- TRAINING CANDIDATES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_candidates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  classification_id     UUID REFERENCES public.classifications(id) ON DELETE SET NULL,
  image_url             TEXT NOT NULL DEFAULT '',
  predicted_class       TEXT,
  predicted_confidence  REAL DEFAULT 0,
  corrected_class       TEXT NOT NULL,
  waste_category        TEXT,
  user_id               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_reviewed        BOOLEAN DEFAULT FALSE,
  admin_approved        BOOLEAN DEFAULT FALSE,
  admin_notes           TEXT DEFAULT '',
  reviewed_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_candidates_status ON public.training_candidates(admin_reviewed, admin_approved);

-- ─────────────────────────────────────────────────────────────
-- ADMIN USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- LEADERBOARD INDEX
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_points ON public.profiles(points DESC);
