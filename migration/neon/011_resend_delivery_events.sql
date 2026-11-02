begin;

-- Resend's send response means the provider accepted the API request; it does
-- not prove mailbox-server delivery.  Keep the sender state and the provider
-- delivery state separate, and retain only the minimal webhook metadata needed
-- for correlation, deduplication, and operational diagnosis.
alter table provider_events
  add column if not exists provider_message_id varchar(255),
  add column if not exists event_occurred_at timestamptz,
  add column if not exists delivery_status varchar(32),
  add column if not exists status_detail text,
  add column if not exists disposition varchar(32);

alter table quote_request_notifications
  add column if not exists provider_status varchar(32),
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_status_detail text;
alter table launch_mail_outbox
  add column if not exists provider_status varchar(32),
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_status_detail text;
alter table review_requests
  add column if not exists provider_status varchar(32),
  add column if not exists provider_status_at timestamptz,
  add column if not exists provider_status_detail text;

-- These preview receipts were created only to verify persistence before an
-- email provider was configured. Keep every row for audit/idempotency tests,
-- but move the unsent messages out of the claimable queued/retrying states so
-- adding RESEND_API_KEY cannot deliver stale synthetic mail. This is
-- deliberately reversible: an operator can set only these rows back to
-- `queued` and clear failure_reason after separately reviewing each recipient.
update quote_request_notifications notification
set status = 'quarantined',
    failure_reason = 'prelaunch_synthetic_quarantine',
    updated_at = now()
from service_requests request
where notification.service_request_id = request.id
  and request.public_id in (
    '01M6DFF6BMNSE451J8X70PB37Z',
    '01M6DES1W4D246DY68W6FCHWTN'
  )
  and notification.status in ('queued','retrying')
  and notification.attempts = 0;

update launch_mail_outbox
set status = 'quarantined',
    failure_reason = 'prelaunch_synthetic_quarantine',
    updated_at = now()
where message_key in (
    'quote-confirmation-01M6DFF6BMNSE451J8X70PB37Z',
    'quote-confirmation-01M6DES1W4D246DY68W6FCHWTN'
  )
  and status in ('queued','retrying')
  and attempts = 0;

update quote_request_notifications
set provider_status = 'accepted',
    provider_status_at = coalesce(sent_at, last_attempt_at, updated_at, created_at, now())
where provider_message_id is not null and status = 'sent' and provider_status is null;
update launch_mail_outbox
set provider_status = 'accepted',
    provider_status_at = coalesce(sent_at, last_attempt_at, updated_at, created_at, now())
where provider_message_id is not null and status = 'sent' and provider_status is null;
update review_requests
set provider_status = 'accepted',
    provider_status_at = coalesce(sent_at, last_attempt_at, updated_at, created_at, now())
where provider_message_id is not null and status = 'sent' and provider_status is null;

do $$
declare
  v_table text;
  v_constraint text;
begin
  foreach v_table in array array['quote_request_notifications','launch_mail_outbox','review_requests'] loop
    v_constraint := v_table || '_provider_status_valid';
    if not exists (
      select 1 from pg_constraint
      where conname = v_constraint and conrelid = format('public.%I', v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check '
        || '(provider_status is null or provider_status in '
        || '(''accepted'',''delayed'',''delivered'',''bounced'',''failed'',''suppressed'',''complained''))',
        v_table, v_constraint
      );
    end if;

    v_constraint := v_table || '_provider_status_time_valid';
    if not exists (
      select 1 from pg_constraint
      where conname = v_constraint and conrelid = format('public.%I', v_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check '
        || '((provider_status is null) = (provider_status_at is null))',
        v_table, v_constraint
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'provider_events_resend_envelope_valid'
      and conrelid = 'public.provider_events'::regclass
  ) then
    alter table provider_events add constraint provider_events_resend_envelope_valid check (
      provider <> 'resend' or (
        provider_message_id is not null and event_occurred_at is not null
        and disposition in ('processed','unmatched','ambiguous','ignored')
        and (delivery_status is null or delivery_status in
          ('accepted','delayed','delivered','bounced','failed','suppressed','complained'))
      )
    );
  end if;
end;
$$;

create unique index if not exists quote_request_notifications_provider_message_uidx
  on quote_request_notifications(provider_message_id) where provider_message_id is not null;
create unique index if not exists launch_mail_outbox_provider_message_uidx
  on launch_mail_outbox(provider_message_id) where provider_message_id is not null;
create unique index if not exists review_requests_provider_message_uidx
  on review_requests(provider_message_id) where provider_message_id is not null;
create index if not exists provider_events_provider_message_idx
  on provider_events(provider, provider_message_id, event_occurred_at desc)
  where provider_message_id is not null;

-- These functions still transition the durable send outbox exactly once.  If
-- a webhook raced ahead of the send response, they reconcile the latest event
-- already stored under the provider message ID instead of downgrading it to
-- merely accepted.
create or replace function app.mark_quote_notification_sent(
  p_notification_id bigint,
  p_attempt_token uuid,
  p_provider_message_id text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with latest as (
    select pe.delivery_status, pe.event_occurred_at, pe.status_detail
    from provider_events pe
    where pe.provider = 'resend' and pe.provider_message_id = p_provider_message_id
      and pe.delivery_status is not null
    order by pe.event_occurred_at desc,
      case pe.delivery_status
        when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
        when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end desc,
      pe.id desc
    limit 1
  ), changed as (
    update quote_request_notifications
    set status = 'sent', provider_message_id = p_provider_message_id,
        sent_at = now(), failure_reason = null,
        provider_status = coalesce((select delivery_status from latest), 'accepted'),
        provider_status_at = coalesce((select event_occurred_at from latest), now()),
        provider_status_detail = (select status_detail from latest),
        updated_at = now()
    where id = p_notification_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_launch_mail_sent(
  p_mail_id bigint,
  p_attempt_token uuid,
  p_provider_message_id text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with latest as (
    select pe.delivery_status, pe.event_occurred_at, pe.status_detail
    from provider_events pe
    where pe.provider = 'resend' and pe.provider_message_id = p_provider_message_id
      and pe.delivery_status is not null
    order by pe.event_occurred_at desc,
      case pe.delivery_status
        when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
        when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end desc,
      pe.id desc
    limit 1
  ), changed as (
    update launch_mail_outbox
    set status = 'sent', provider_message_id = p_provider_message_id,
        sent_at = now(), failure_reason = null,
        provider_status = coalesce((select delivery_status from latest), 'accepted'),
        provider_status_at = coalesce((select event_occurred_at from latest), now()),
        provider_status_detail = (select status_detail from latest),
        updated_at = now()
    where id = p_mail_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_review_request_sent(
  p_review_request_id bigint,
  p_attempt_token uuid,
  p_provider_message_id text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with latest as (
    select pe.delivery_status, pe.event_occurred_at, pe.status_detail
    from provider_events pe
    where pe.provider = 'resend' and pe.provider_message_id = p_provider_message_id
      and pe.delivery_status is not null
    order by pe.event_occurred_at desc,
      case pe.delivery_status
        when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
        when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end desc,
      pe.id desc
    limit 1
  ), changed as (
    update review_requests
    set status = 'sent', provider_message_id = p_provider_message_id,
        sent_at = now(), reason = null,
        provider_status = coalesce((select delivery_status from latest), 'accepted'),
        provider_status_at = coalesce((select event_occurred_at from latest), now()),
        provider_status_detail = (select status_detail from latest),
        updated_at = now()
    where id = p_review_request_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

-- Called only after the Worker verifies the signature over the bounded raw
-- body.  The provider event insert and outbox state transition share one
-- transaction, while (provider,event_id) makes retries and manual replays safe.
create or replace function app.process_resend_event(
  p_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_event_at timestamptz,
  p_status_detail text
)
returns table(disposition text, outbox_kind text, outbox_id bigint, delivery_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_provider_event_id bigint;
  v_delivery_status text;
  v_match_count integer;
  v_outbox_kind text;
  v_outbox_id bigint;
  v_current_status text;
  v_rank integer;
begin
  if p_event_id is null or length(p_event_id) < 3 or length(p_event_id) > 255
     or p_event_type is null or length(p_event_type) < 7 or length(p_event_type) > 80
     or p_event_type !~ '^email\.[a-z_]+$'
     or p_provider_message_id is null or length(p_provider_message_id) < 3
     or length(p_provider_message_id) > 255 or p_event_at is null
     or length(coalesce(p_status_detail, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Invalid Resend event envelope.';
  end if;

  v_delivery_status := case p_event_type
    when 'email.sent' then 'accepted'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    when 'email.complained' then 'complained'
    else null
  end;

  insert into provider_events(
    provider, event_id, event_type, provider_message_id, event_occurred_at,
    delivery_status, status_detail, disposition, created_at, updated_at
  ) values (
    'resend', p_event_id, p_event_type, p_provider_message_id, p_event_at,
    v_delivery_status, left(nullif(p_status_detail, ''), 500),
    case when v_delivery_status is null then 'ignored' else 'unmatched' end,
    v_now, v_now
  )
  on conflict (provider, event_id) do nothing
  returning id into v_provider_event_id;

  if v_provider_event_id is null then
    return query select 'duplicate'::text, null::text, null::bigint, null::text;
    return;
  end if;

  if v_delivery_status is null then
    update provider_events set processed_at = v_now, updated_at = v_now
    where id = v_provider_event_id;
    return query select 'ignored'::text, null::text, null::bigint, null::text;
    return;
  end if;

  select (
    (select count(*) from quote_request_notifications where provider_message_id = p_provider_message_id)
    + (select count(*) from launch_mail_outbox where provider_message_id = p_provider_message_id)
    + (select count(*) from review_requests where provider_message_id = p_provider_message_id)
  )::integer into v_match_count;

  if v_match_count = 0 then
    update provider_events
    set disposition = 'unmatched', processed_at = v_now, updated_at = v_now
    where id = v_provider_event_id;
    return query select 'unmatched'::text, null::text, null::bigint, v_delivery_status;
    return;
  elsif v_match_count > 1 then
    update provider_events
    set disposition = 'ambiguous', processed_at = v_now, updated_at = v_now
    where id = v_provider_event_id;
    return query select 'ambiguous'::text, null::text, null::bigint, v_delivery_status;
    return;
  end if;

  v_rank := case v_delivery_status
    when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
    when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end;

  select id into v_outbox_id from quote_request_notifications
  where provider_message_id = p_provider_message_id for update;
  if found then
    v_outbox_kind := 'quote_notification';
    update quote_request_notifications
    set provider_status = v_delivery_status, provider_status_at = p_event_at,
        provider_status_detail = left(nullif(p_status_detail, ''), 500), updated_at = v_now
    where id = v_outbox_id and (
      provider_status_at is null or p_event_at > provider_status_at
      or (p_event_at = provider_status_at and v_rank >= case provider_status
        when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
        when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end)
    );
    select provider_status into v_current_status from quote_request_notifications where id = v_outbox_id;
  else
    select id into v_outbox_id from launch_mail_outbox
    where provider_message_id = p_provider_message_id for update;
    if found then
      v_outbox_kind := 'launch_mail';
      update launch_mail_outbox
      set provider_status = v_delivery_status, provider_status_at = p_event_at,
          provider_status_detail = left(nullif(p_status_detail, ''), 500), updated_at = v_now
      where id = v_outbox_id and (
        provider_status_at is null or p_event_at > provider_status_at
        or (p_event_at = provider_status_at and v_rank >= case provider_status
          when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
          when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end)
      );
      select provider_status into v_current_status from launch_mail_outbox where id = v_outbox_id;
    else
      select id into v_outbox_id from review_requests
      where provider_message_id = p_provider_message_id for update;
      v_outbox_kind := 'review_request';
      update review_requests
      set provider_status = v_delivery_status, provider_status_at = p_event_at,
          provider_status_detail = left(nullif(p_status_detail, ''), 500), updated_at = v_now
      where id = v_outbox_id and (
        provider_status_at is null or p_event_at > provider_status_at
        or (p_event_at = provider_status_at and v_rank >= case provider_status
          when 'complained' then 70 when 'suppressed' then 60 when 'failed' then 60
          when 'bounced' then 60 when 'delivered' then 50 when 'delayed' then 20 else 10 end)
      );
      select provider_status into v_current_status from review_requests where id = v_outbox_id;
    end if;
  end if;

  update provider_events
  set disposition = 'processed', processed_at = v_now, updated_at = v_now
  where id = v_provider_event_id;
  return query select 'processed'::text, v_outbox_kind, v_outbox_id, v_current_status;
end;
$$;

revoke execute on function app.process_resend_event(text,text,text,timestamptz,text) from public;
grant execute on function app.process_resend_event(text,text,text,timestamptz,text) to ecc_edge_runtime;

commit;
