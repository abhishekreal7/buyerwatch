ALTER TABLE profiles ADD COLUMN competitors text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN tone_examples text;
ALTER TABLE monitored_threads ADD COLUMN flag text;
