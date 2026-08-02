-- ======================================================
-- Differentiator Features Migration
-- Adds: reasoning trace, google rank, attribution table
-- ======================================================

-- Feature 1: Signal Trace — store reasoning from LLM scorer
ALTER TABLE monitored_threads ADD COLUMN IF NOT EXISTS score_reasoning TEXT;

-- Feature 5: Thread Consequence Score — google rank position (null = unchecked, 0 = not ranked, 1-10 = page 1)
ALTER TABLE monitored_threads ADD COLUMN IF NOT EXISTS google_rank_position INTEGER;

-- Feature 2: Reply Attribution — click tracking table
CREATE TABLE IF NOT EXISTS reply_attribution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE,
  thread_id       uuid REFERENCES monitored_threads(id) ON DELETE CASCADE,
  attribution_token TEXT NOT NULL UNIQUE,  -- short random token embedded in UTM link
  clicked_at      timestamptz,
  converted_at    timestamptz,
  revenue_usd     numeric(10, 2),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE reply_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own attributions" ON reply_attribution;
CREATE POLICY "own attributions" ON reply_attribution FOR ALL USING (auth.uid() = user_id);

-- Public insert allowed for the /api/track/click endpoint (no auth session on click)
DROP POLICY IF EXISTS "public click tracking" ON reply_attribution;
CREATE POLICY "public click tracking" ON reply_attribution
  FOR UPDATE USING (true)
  WITH CHECK (true);
