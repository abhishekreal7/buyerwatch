-- Fix: ensure reply_attribution.attribution_token has a named unique index
-- so that the upsert onConflict: 'attribution_token' works correctly.
-- The inline UNIQUE from CREATE TABLE may not have created a named index
-- that Supabase's PostgREST upsert can reference.

create unique index if not exists reply_attribution_token_uidx
  on public.reply_attribution(attribution_token);
