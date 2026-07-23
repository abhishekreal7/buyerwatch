-- Fix: plan constraint used 'business' but codebase uses 'growth'
-- Drop the old check constraint and add the correct one.

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'growth'));

-- Migrate any existing 'business' rows to 'growth' just in case
UPDATE profiles SET plan = 'growth' WHERE plan = 'business';
