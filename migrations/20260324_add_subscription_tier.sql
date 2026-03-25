-- Add subscription_tier to profiles for chat paywall
-- Values: 'free' (default), 'premium', 'clinical'
-- Run this against the shared Supabase project (used by both Healix and HealthBite)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free';

-- Set your own account to premium for testing:
-- UPDATE profiles SET subscription_tier = 'premium' WHERE auth_user_id = '<your-user-id>';
