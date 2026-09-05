-- Capture how a new workspace discovered BuyerWatch without making onboarding
-- dependent on a third-party analytics provider.
alter table public.profiles
  add column if not exists discovery_source text;

alter table public.profiles
  drop constraint if exists profiles_discovery_source_check;

alter table public.profiles
  add constraint profiles_discovery_source_check
  check (
    discovery_source is null
    or discovery_source in (
      'search',
      'social',
      'recommendation',
      'community',
      'content',
      'other',
      'prefer_not_to_say'
    )
  ) not valid;

comment on column public.profiles.discovery_source is
  'Optional self-reported acquisition source selected during onboarding.';
