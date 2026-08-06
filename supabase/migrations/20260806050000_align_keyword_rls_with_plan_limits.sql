-- Keep the RLS insert guard aligned with the canonical plan limits enforced
-- by enforce_keyword_plan_limit(). Without this, Starter and Growth users
-- were rejected after two rules despite their higher entitlements.

drop policy if exists "own keywords insert under plan limit" on public.keywords;

create policy "own keywords insert under plan limit"
  on public.keywords for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      select count(*)::integer
      from public.keywords as existing_keyword
      where existing_keyword.user_id = auth.uid()
    ) < case coalesce(
      (select plan from public.profiles where id = auth.uid()),
      'free'
    )
      when 'growth' then 50
      when 'pro' then 10
      when 'starter' then 5
      else 1
    end
  );
