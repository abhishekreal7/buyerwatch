-- The dashboard settings form writes this preference directly with the
-- authenticated Supabase client. Column-level privileges are intentionally
-- restrictive on profiles, so grant only this newly user-editable field.

grant update (high_intent_threshold) on public.profiles to authenticated;
