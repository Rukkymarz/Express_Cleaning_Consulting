begin;

-- A01 operator failure alert: an aggregate, PII-free view of outbox health that
-- an independent monitor (n8n) can poll. The runtime role keeps function-only
-- access; this function returns counts and timestamps, never recipients,
-- payloads, names, or provider message IDs.
--
-- Terminal states:  failed, needs_reconciliation (quote notifications and
--                   customer mail), failed (review requests).
-- Stuck:            queued/retrying/sending older than p_stuck_minutes.
-- Provider-level:   bounced/complained/failed/suppressed delivery webhooks.
-- Quarantined synthetic rows (011) are excluded everywhere.
create or replace function app.ops_delivery_health(p_stuck_minutes integer default 30)
returns table(
  checked_at timestamptz,
  quote_terminal bigint,
  quote_stuck bigint,
  quote_oldest_pending_minutes integer,
  quote_provider_problem bigint,
  launch_terminal bigint,
  launch_stuck bigint,
  launch_provider_problem bigint,
  review_terminal bigint,
  newest_problem_at timestamptz,
  last_quote_sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_stuck interval;
begin
  if p_stuck_minutes is null or p_stuck_minutes < 5 or p_stuck_minutes > 1440 then
    raise exception 'p_stuck_minutes must be between 5 and 1440';
  end if;
  v_stuck := make_interval(mins => p_stuck_minutes);

  return query
  with q as (
    select
      count(*) filter (where status in ('failed','needs_reconciliation')) as terminal,
      count(*) filter (where status in ('queued','retrying','sending')
                         and coalesce(last_attempt_at, created_at) <= now() - v_stuck) as stuck,
      max(extract(epoch from now() - created_at) / 60)
        filter (where status in ('queued','retrying','sending')) as oldest_pending,
      count(*) filter (where provider_status in ('bounced','complained','failed','suppressed')) as provider_problem,
      max(updated_at) filter (where status in ('failed','needs_reconciliation')
                                 or provider_status in ('bounced','complained','failed','suppressed')) as newest_problem,
      max(sent_at) as last_sent
    from quote_request_notifications
    where status <> 'quarantined'
  ), l as (
    select
      count(*) filter (where status in ('failed','needs_reconciliation')) as terminal,
      count(*) filter (where status in ('queued','retrying','sending')
                         and coalesce(last_attempt_at, created_at) <= now() - v_stuck) as stuck,
      count(*) filter (where provider_status in ('bounced','complained','failed','suppressed')) as provider_problem,
      max(updated_at) filter (where status in ('failed','needs_reconciliation')
                                 or provider_status in ('bounced','complained','failed','suppressed')) as newest_problem
    from launch_mail_outbox
    where status <> 'quarantined'
  ), r as (
    select
      count(*) filter (where status = 'failed') as terminal,
      max(updated_at) filter (where status = 'failed') as newest_problem
    from review_requests
  )
  select
    now(),
    q.terminal, q.stuck, coalesce(floor(q.oldest_pending), 0)::integer, q.provider_problem,
    l.terminal, l.stuck, l.provider_problem,
    r.terminal,
    greatest(q.newest_problem, l.newest_problem, r.newest_problem),
    q.last_sent
  from q, l, r;
end;
$$;

revoke all on function app.ops_delivery_health(integer) from public;
grant execute on function app.ops_delivery_health(integer) to ecc_edge_runtime;

commit;
