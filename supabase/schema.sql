-- ============================================
-- GREYSTONE TRADING PLATFORM - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- User Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  tickers JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Settings (theme, refresh interval, default timeframe, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Credentials (encrypted keys per user)
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,  -- 'alpaca', 'anthropic', etc.
  encrypted_key TEXT NOT NULL,
  encrypted_secret TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, credential_type)
);

-- Portfolios (one JSONB document per user: positions with their transaction
-- series, the realized-gains ledger, and recent activity; written by the
-- portfolio tracker's cloud sync)
CREATE TABLE IF NOT EXISTS portfolios (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- user_profiles: users can only read/write their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- watchlists: users can only access their own watchlists
CREATE POLICY "Users can view own watchlists"
  ON watchlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlists"
  ON watchlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlists"
  ON watchlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlists"
  ON watchlists FOR DELETE
  USING (auth.uid() = user_id);

-- user_settings: users can only access their own settings
CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- api_credentials: users can only access their own credentials
CREATE POLICY "Users can view own credentials"
  ON api_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credentials"
  ON api_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials"
  ON api_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials"
  ON api_credentials FOR DELETE
  USING (auth.uid() = user_id);

-- portfolios: users can only access their own portfolio
CREATE POLICY "Users can view own portfolio"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolio"
  ON portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolio"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolio"
  ON portfolios FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_settings (user_id, settings)
  VALUES (NEW.id, '{}'::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_user_id ON api_credentials(user_id);

-- Durable server state (service-role only: RLS enabled with NO policies, so
-- only the server's service-role client can read or write). Holds the
-- rotating Questrade refresh token and paper-trading session snapshots.
CREATE TABLE IF NOT EXISTS server_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE server_state ENABLE ROW LEVEL SECURITY;
