-- User-controlled dashboard/analytics cutoff. This preference is deliberately
-- separate from canonical AI intent labels and the Slack notification cutoff.

alter table public.profiles
  add column if not exists high_intent_threshold smallint;

update public.profiles
set high_intent_threshold = 80
where high_intent_threshold is null;

-- Clamp any value left by a partial/manual rollout before enforcing the bound.
update public.profiles
set high_intent_threshold = greatest(60, least(95, high_intent_threshold))
where high_intent_threshold < 60 or high_intent_threshold > 95;

alter table public.profiles
  alter column high_intent_threshold set default 80,
  alter column high_intent_threshold set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_high_intent_threshold_check'
  ) then
    alter table public.profiles
      add constraint profiles_high_intent_threshold_check
      check (high_intent_threshold between 60 and 95);
  end if;
end
$$;
