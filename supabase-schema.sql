-- Twitch Ad Crusher - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  license_key TEXT UNIQUE NOT NULL,
  stripe_payment_id TEXT,
  stripe_customer_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE, -- NULL = lifetime
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_payment_id ON licenses(stripe_payment_id);

-- Usage stats table (for Pro analytics)
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ads_blocked INTEGER DEFAULT 0,
  time_saved_seconds INTEGER DEFAULT 0,
  channels JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(license_id, date)
);

-- Index for stats queries
CREATE INDEX IF NOT EXISTS idx_usage_stats_license_date ON usage_stats(license_id, date);

-- Function to generate license key
CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
  j INTEGER;
BEGIN
  FOR j IN 1..3 LOOP
    IF j > 1 THEN
      result := result || '-';
    END IF;
    FOR i IN 1..4 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- Policies (allow service role full access)
CREATE POLICY "Service role can do everything on licenses" ON licenses
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can do everything on usage_stats" ON usage_stats
  FOR ALL USING (true) WITH CHECK (true);

-- Sample query to create a license (for testing)
-- INSERT INTO licenses (email, license_key) 
-- VALUES ('test@example.com', generate_license_key());
