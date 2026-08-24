begin;

-- X is a Professional/Growth entitlement in application policy. The database
-- only permits it as an automation target; server-side plan and connection
-- gates decide who can actually enable it.
alter table public.profiles
  drop constraint if exists profiles_auto_send_platforms_check;

alter table public.profiles
  add constraint profiles_auto_send_platforms_check
    check (
      auto_send_platforms <@ array['reddit', 'bluesky', 'x']::text[]
      and cardinality(auto_send_platforms) <= 3
    );

commit;
