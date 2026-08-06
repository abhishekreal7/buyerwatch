-- The old discovery path saved generic buyer-language hits as pending before
-- validating product relevance. Those rows could appear as fake "0" scores and
-- block the global scoring queue indefinitely. Preserve an audit trail without
-- exposing unanalysed candidates as active leads.
update public.monitored_threads
set
  status = 'dismissed',
  score_reasoning = 'Cleared from the analysis queue during the intent-quality recovery. This post was never presented as a qualified lead.',
  automation_reason = 'intent_quality_recovery'
where status = 'pending'
  and intent_score is null
  and automation_reason = 'analysis_pending';
