-- Enforce keyword plan limits at the RLS layer (second defense after API).
-- free: 2 keywords | pro: 20 keywords
-- Legacy 'business' (and any unknown plan) is treated as free.

-- Replace broad FOR ALL policy with per-command policies so INSERT can
-- carry a plan-limit WITH CHECK independently of SELECT/UPDATE/DELETE.

drop policy if exists "own keywords" on keywords;

create policy "own keywords select"
  on keywords for select
  using (auth.uid() = user_id);

create policy "own keywords update"
  on keywords for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own keywords delete"
  on keywords for delete
  using (auth.uid() = user_id);

create policy "own keywords insert under plan limit"
  on keywords for insert
  with check (
    auth.uid() = user_id
    and (
      select count(*)::int
      from keywords k
      where k.user_id = auth.uid()
    ) < case
      when coalesce(
        (select plan from profiles where id = auth.uid()),
        'free'
      ) = 'pro' then 20
      else 2
    end
  );
