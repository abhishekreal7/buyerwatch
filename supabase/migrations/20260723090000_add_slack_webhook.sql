-- Add Slack notification fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS slack_notify_threshold INTEGER DEFAULT 70;
