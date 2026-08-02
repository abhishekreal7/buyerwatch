-- Cover the read patterns used by the dashboard's bounded lists and counters.
create index if not exists monitored_threads_user_keyword_status_idx
  on public.monitored_threads(user_id, keyword_id, status);

create index if not exists reply_analytics_user_sent_idx
  on public.reply_analytics(user_id, was_sent, sent_at desc);

create index if not exists reply_attribution_user_clicked_idx
  on public.reply_attribution(user_id, clicked_at)
  where clicked_at is not null;

create index if not exists reply_attribution_user_converted_idx
  on public.reply_attribution(user_id, converted_at)
  where converted_at is not null;

create index if not exists draft_feedback_user_created_idx
  on public.draft_feedback(user_id, created_at desc);
