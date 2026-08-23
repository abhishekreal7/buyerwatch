-- Provider-credit alerts are internal operating-cost signals. Resolve any
-- previously created global incidents so they disappear from customer
-- dashboards and cannot be delivered by the customer incident email queue.
update public.service_incidents
set
  status = 'resolved',
  resolved_at = coalesce(resolved_at, now()),
  updated_at = now()
where platform = 'reddit'
  and kind = 'credits_low'
  and user_id is null
  and status = 'open';
