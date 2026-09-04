-- Indexed, RLS-bound conversation search with a strict response cap.
create index if not exists monitored_threads_search_idx
  on public.monitored_threads using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' || coalesce(text_content, '') || ' ' || coalesce(platform, '')
    )
  );

create index if not exists keywords_search_idx
  on public.keywords using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(term, '') || ' ' || coalesce(target, '')
    )
  );

create or replace function public.search_monitored_threads_v1(
  p_query text,
  p_statuses text[],
  p_min_intent numeric default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table(thread jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with matching as (
    select t.*
    from public.monitored_threads t
    where auth.uid() is not null
      and t.user_id = auth.uid()
      and t.intent_score is not null
      and t.status = any(p_statuses)
      and (p_min_intent is null or t.intent_score >= p_min_intent)
      and (
        to_tsvector(
          'simple'::regconfig,
          coalesce(t.title, '') || ' ' || coalesce(t.text_content, '') || ' ' || coalesce(t.platform, '')
        ) @@ websearch_to_tsquery('simple'::regconfig, p_query)
        or exists (
          select 1
          from public.keywords k
          where k.id = t.keyword_id
            and k.user_id = auth.uid()
            and to_tsvector(
              'simple'::regconfig,
              coalesce(k.term, '') || ' ' || coalesce(k.target, '')
            ) @@ websearch_to_tsquery('simple'::regconfig, p_query)
        )
      )
  ), counted as (
    select matching.*, count(*) over () as result_count
    from matching
    order by source_created_at desc nulls last, created_at desc, id desc
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  )
  select
    to_jsonb(c) - 'result_count'
      || jsonb_build_object(
        'reply_analytics', (
          select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
            select ra.draft_text
            from public.reply_analytics ra
            where ra.thread_id = c.id and ra.user_id = auth.uid()
            limit 1
          ) r
        ),
        'keywords', (
          select to_jsonb(k) from (
            select kw.term, kw.target
            from public.keywords kw
            where kw.id = c.keyword_id and kw.user_id = auth.uid()
            limit 1
          ) k
        )
      ) as thread,
    c.result_count as total_count
  from counted c;
$$;

revoke all on function public.search_monitored_threads_v1(text, text[], numeric, integer, integer)
  from public, anon;
grant execute on function public.search_monitored_threads_v1(text, text[], numeric, integer, integer)
  to authenticated;
