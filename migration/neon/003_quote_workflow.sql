begin;

create schema if not exists app;
revoke all on schema app from public;

-- Legacy rows predate first-attempt tracking. Backfill conservatively so the
-- provider idempotency window can never be extended by a later retry.
update quote_request_notifications
set first_attempt_at = coalesce(first_attempt_at, last_attempt_at, created_at),
    last_attempt_at = coalesce(last_attempt_at, created_at)
where attempts > 0;

update launch_mail_outbox
set first_attempt_at = coalesce(first_attempt_at, last_attempt_at, sent_at, created_at),
    last_attempt_at = coalesce(last_attempt_at, sent_at, first_attempt_at, created_at)
where attempts > 0;

create or replace function app.sync_lead(p_lead_id bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_lead leads%rowtype;
  v_latest_request_id bigint;
  v_latest service_requests%rowtype;
  v_has_completed boolean;
  v_has_booked boolean;
  v_has_sent_quote boolean;
  v_has_accepted_quote boolean;
  v_stage text;
  v_score integer := 0;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then return; end if;

  select max(id) into v_latest_request_id from service_requests where lead_id = p_lead_id;
  if v_latest_request_id is not null then
    select * into v_latest from service_requests where id = v_latest_request_id;
  end if;

  select exists(
    select 1 from bookings booking
    join quotes quote on quote.id = booking.quote_id
    where quote.service_request_id = v_latest_request_id and booking.status = 'completed'
  ) into v_has_completed;
  select exists(
    select 1 from bookings booking
    join quotes quote on quote.id = booking.quote_id
    where quote.service_request_id = v_latest_request_id
      and booking.status in ('scheduled','in_progress','quality_review','rework')
  ) into v_has_booked;
  select exists(
    select 1 from quotes quote where quote.service_request_id = v_latest_request_id
      and quote.status in ('sent','accepted')
  ) into v_has_sent_quote;
  select exists(
    select 1 from quotes quote where quote.service_request_id = v_latest_request_id
      and quote.status = 'accepted'
  ) into v_has_accepted_quote;

  v_stage := case
    when v_has_completed then 'completed'
    when v_has_booked then 'booked'
    when v_has_sent_quote then 'quote_sent'
    when v_latest_request_id is not null then 'quote_requested'
    else 'new_lead'
  end;

  if v_lead.email is not null then v_score := v_score + 10; end if;
  if v_lead.phone is not null then v_score := v_score + 10; end if;
  if v_latest_request_id is not null then
    v_score := v_score + 20;
    if v_latest.square_feet is not null or nullif(v_latest.scope_notes, '') is not null then
      v_score := v_score + 10;
    end if;
    if v_latest.preferred_start_at is not null then
      v_score := v_score + 10;
      if v_latest.preferred_start_at between now() and now() + interval '14 days' then
        v_score := v_score + 10;
      end if;
    end if;
  end if;
  if v_has_sent_quote then v_score := v_score + 10; end if;
  if v_has_accepted_quote then v_score := v_score + 10; end if;
  if exists(select 1 from calls where lead_id = p_lead_id and disposition in ('interested','follow_up')) then
    v_score := v_score + 10;
  end if;
  if v_lead.status = 'lost' or v_stage = 'completed' then v_score := 0; end if;

  update leads
  set pipeline_stage = v_stage, lead_score = least(100, v_score),
      scored_at = now(), updated_at = now()
  where id = p_lead_id;
end;
$$;

create or replace function app.public_catalog_services()
returns table(
  code text, slug text, name text, category text, description text,
  instant_eligible boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  select service.code::text, service.slug::text, service.name::text,
    service.category::text, service.description, service.instant_eligible
  from service_types service
  where service.published = true and service.request_enabled = true
  order by service.category, service.name
$$;

create or replace function app.public_catalog_markets()
returns table(slug text, city text, region text, status text)
language sql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  select market.slug::text, market.city::text, market.region::text, market.status::text
  from markets market
  where market.published = true
  order by market.region, market.city
$$;

drop function if exists app.create_callback_request(
  text,text,text,text,text,text,text,text,text,text,text,text
);

create or replace function app.create_callback_request(
  p_idempotency_key text,
  p_request_public_id text,
  p_lead_public_id text,
  p_task_public_id text,
  p_name text,
  p_phone text,
  p_email text,
  p_service_code text,
  p_region text,
  p_postal_code text,
  p_notes text,
  p_promotion_code text,
  p_review_url text
)
returns table(
  request_id text,
  created boolean,
  service_request_id bigint,
  task_status text,
  notification_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_event_id bigint;
  v_existing_receipt text;
  v_existing_payload_hash text;
  v_payload_hash text;
  v_service service_types%rowtype;
  v_lead_id bigint;
  v_address_id bigint;
  v_request_id bigint;
  v_task_id bigint;
  v_scope_notes text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 120
     or p_idempotency_key !~ '^[!-~]+$' then
    raise exception using errcode = '22023', message = 'Idempotency-Key must contain 8 to 120 characters.';
  end if;
  if p_request_public_id is null or p_request_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_lead_public_id is null or p_lead_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_task_public_id is null or p_task_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Public identifiers are required.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 150
     or p_phone is null or length(p_phone) > 32
     or p_phone !~ '^\+?[0-9(). -]+$'
     or regexp_replace(p_phone, '[^0-9]', '', 'g') !~ '^(1)?[2-9][0-9]{2}[2-9][0-9]{6}$'
     or length(coalesce(p_email, '')) > 255
     or (nullif(p_email, '') is not null and p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or p_service_code is null or p_service_code !~ '^[A-Z0-9-]{1,32}$'
     or p_region is null or p_region not in (
       'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
       'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
     )
     or p_postal_code is null or p_postal_code !~ '^[0-9]{5}(-[0-9]{4})?$'
     or length(coalesce(p_notes, '')) > 3000
     or coalesce(p_promotion_code, '') not in ('', 'FIRSTCLEAN10')
     or p_review_url is null or length(p_review_url) > 2048 or p_review_url !~ '^https://' then
    raise exception using errcode = '22023', message = 'Invalid quote request payload.';
  end if;

  v_payload_hash := encode(digest(jsonb_build_object(
    'name', p_name,
    'phone', p_phone,
    'email', coalesce(p_email, ''),
    'service_code', p_service_code,
    'region', p_region,
    'postal_code', p_postal_code,
    'notes', coalesce(p_notes, ''),
    'promotion_code', coalesce(p_promotion_code, '')
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('public_request:' || p_idempotency_key, 0));

  select pe.id, ae.action, ae.changes->>'payload_hash'
    into v_event_id, v_existing_receipt, v_existing_payload_hash
  from provider_events pe
  left join audit_events ae
    on ae.entity_type = 'request_receipt' and ae.entity_id = pe.id
  where pe.provider = 'public_request' and pe.event_id = p_idempotency_key;

  if v_event_id is not null then
    if v_existing_receipt is null then
      raise exception using errcode = '40001', message = 'The original request is still being committed; retry safely.';
    end if;
    if v_existing_payload_hash is not null and v_existing_payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'This Idempotency-Key was already used for a different quote request.';
    end if;
    select sr.id into v_request_id from service_requests sr where sr.public_id = v_existing_receipt;
    return query
      select v_existing_receipt, false, v_request_id, st.status::text, qn.status::text
      from staff_tasks st
      join quote_request_notifications qn on qn.staff_task_id = st.id
      where st.service_request_id = v_request_id and st.kind = 'quote_review';
    return;
  end if;

  select * into v_service
  from service_types
  where code = p_service_code
    and request_enabled = true
    and published = true
    and category <> 'Add-on';
  if not found then
    raise exception using errcode = '22023', message = 'Service unavailable for requests.';
  end if;

  insert into provider_events(provider, event_id, event_type, created_at, updated_at)
  values ('public_request', p_idempotency_key, 'request.created', v_now, v_now)
  returning id into v_event_id;

  insert into leads(public_id, name, email, phone, source, status, pipeline_stage, lead_score, created_at, updated_at)
  values (p_lead_public_id, p_name, nullif(p_email, ''), p_phone, 'web', 'new', 'new_lead', 0, v_now, v_now)
  returning id into v_lead_id;

  insert into addresses(street, unit, city, region, postal_code, country, created_at, updated_at)
  values (null, null, null, p_region, p_postal_code, 'US', v_now, v_now)
  returning id into v_address_id;

  v_scope_notes := 'Callback requested. Confirm address, property details, cleaning scope and preferred date by phone.';
  if nullif(trim(coalesce(p_notes, '')), '') is not null then
    v_scope_notes := v_scope_notes || E'\n' || trim(p_notes);
  end if;
  if p_promotion_code = 'FIRSTCLEAN10' then
    v_scope_notes := v_scope_notes || E'\nRequested offer: FIRSTCLEAN10 (10% up to $30; staff must confirm eligibility before quote approval).';
  end if;

  insert into service_requests(
    public_id, lead_id, address_id, service_type_id, status, property_type,
    frequency, condition, pets_on_site, supplies_available, time_zone,
    scope_notes, created_at, updated_at
  ) values (
    p_request_public_id, v_lead_id, v_address_id, v_service.id, 'received', 'other',
    null, 'unsure', null, 'unsure', null, v_scope_notes, v_now, v_now
  ) returning id into v_request_id;

  insert into consents(lead_id, channel, granted, source, policy_version, recorded_at, created_at, updated_at)
  select v_lead_id, channel, false, 'callback_form', '2026-09', v_now, v_now, v_now
  from unnest(array['transactional_sms','marketing_email','marketing_sms','review_email']) as channel;

  update provider_events set processed_at = v_now, updated_at = v_now where id = v_event_id;
  insert into audit_events(entity_type, entity_id, action, changes, created_at, updated_at)
  values ('request_receipt', v_event_id, p_request_public_id,
    jsonb_build_object('payload_hash', v_payload_hash), v_now, v_now);

  insert into staff_tasks(public_id, service_request_id, kind, status, created_at, updated_at)
  values (p_task_public_id, v_request_id, 'quote_review', 'open', v_now, v_now)
  returning id into v_task_id;

  insert into quote_request_notifications(
    service_request_id, staff_task_id, status, payload, attempts, created_at, updated_at
  ) values (
    v_request_id,
    v_task_id,
    'queued',
    jsonb_build_object(
      'receipt', p_request_public_id,
      'customer_name', p_name,
      'email', coalesce(nullif(p_email, ''), 'Not provided - call customer'),
      'phone', p_phone,
      'service', v_service.name,
      'location', p_region || ' ' || p_postal_code || ' - call to confirm address and scope.',
      'task_status', 'open',
      'review_url', p_review_url
    ),
    0,
    v_now,
    v_now
  );

  if nullif(p_email, '') is not null then
    insert into launch_mail_outbox(
      message_key, recipient, subject, body, status, attempts, created_at, updated_at
    ) values (
      'quote-confirmation-' || p_request_public_id,
      p_email,
      'We received your cleaning quote request',
      'Hello ' || p_name || E',\n\nWe received your free quote request.\nReference: ' || p_request_public_id ||
        E'\nService: ' || v_service.name || E'\nLocation: ' || p_region || ' ' || p_postal_code ||
        E'\n\nOur team will call you to confirm the address, cleaning details, pricing and availability. This is not a confirmed booking, and no payment has been taken.\n\nQuestions? Reply to support@expresscleaningconsult.com or call (281) 972-7712.',
      'queued', 0, v_now, v_now
    ) on conflict (message_key) do nothing;
  end if;

  perform app.sync_lead(v_lead_id);

  return query select p_request_public_id, true, v_request_id, 'open'::text, 'queued'::text;
end;
$$;

create or replace function app.request_workflow_status(p_request_public_id text)
returns table(request_id text, request_status text, task_status text, notification_status text)
language sql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  select sr.public_id, sr.status, st.status, qn.status
  from service_requests sr
  join staff_tasks st on st.service_request_id = sr.id and st.kind = 'quote_review'
  join quote_request_notifications qn on qn.service_request_id = sr.id
  where sr.public_id = p_request_public_id
$$;

create or replace function app.claim_quote_notification()
returns table(
  notification_id bigint,
  attempt_token uuid,
  payload jsonb,
  attempts smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_id bigint;
  v_token uuid := gen_random_uuid();
begin
  update quote_request_notifications
  set status = case
      when first_attempt_at <= now() - interval '23 hours' then 'needs_reconciliation'
      else 'retrying'
    end,
    failure_reason = case
      when first_attempt_at <= now() - interval '23 hours' then 'provider_idempotency_window_expired'
      else 'stale_sender_recovered'
    end,
    updated_at = now()
  where status = 'sending' and last_attempt_at <= now() - interval '5 minutes';

  select qn.id into v_id
  from quote_request_notifications qn
  where qn.status in ('queued','retrying')
    and qn.attempts < 3
    and (qn.first_attempt_at is null or qn.first_attempt_at > now() - interval '23 hours')
  order by qn.created_at, qn.id
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update quote_request_notifications qn
  set status = 'sending',
      attempts = qn.attempts + 1,
      attempt_token = v_token,
      first_attempt_at = coalesce(qn.first_attempt_at, now()),
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  where qn.id = v_id;

  return query
    select qn.id, qn.attempt_token, qn.payload, qn.attempts
    from quote_request_notifications qn
    where qn.id = v_id and qn.attempt_token = v_token;
end;
$$;

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
  with changed as (
    update quote_request_notifications
    set status = 'sent', provider_message_id = p_provider_message_id,
        sent_at = now(), failure_reason = null, updated_at = now()
    where id = p_notification_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_quote_notification_retry(
  p_notification_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update quote_request_notifications
    set status = case when attempts >= 3 then 'needs_reconciliation' else 'retrying' end,
        failure_reason = left(coalesce(p_reason, 'transient_or_ambiguous_provider_error'), 2000),
        updated_at = now()
    where id = p_notification_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_quote_notification_failed(
  p_notification_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update quote_request_notifications
    set status = 'failed',
        failure_reason = left(coalesce(p_reason, 'permanent_provider_error'), 2000),
        updated_at = now()
    where id = p_notification_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.create_public_intake(
  p_request_key text,
  p_public_id text,
  p_kind text,
  p_payload_hash text,
  p_name text,
  p_email text,
  p_details jsonb,
  p_marketing_email boolean,
  p_staff_to text,
  p_staff_body text,
  p_discount_body text
)
returns table(receipt text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_id bigint;
  v_existing public_intakes%rowtype;
  v_created boolean := false;
begin
  if p_request_key is null or length(p_request_key) < 8 or length(p_request_key) > 120
     or p_request_key !~ '^[!-~]+$'
     or p_public_id is null or p_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_kind is null or p_kind not in ('discount','partner','referral','vendor')
     or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_details is null or jsonb_typeof(p_details) <> 'object'
     or p_marketing_email is null
     or p_email is null or length(p_email) > 255
     or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or lower(coalesce(p_staff_to, '')) <> 'expressconsulting92@gmail.com'
     or p_staff_body is null or p_staff_body = ''
     or (p_kind = 'discount' and (p_discount_body is null or p_discount_body = '')) then
    raise exception using errcode = '22023', message = 'Invalid public intake payload.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public_intake:' || p_request_key, 0));
  insert into public_intakes(
    public_id, kind, request_key, payload_hash, name, email, details,
    marketing_email, created_at, updated_at
  ) values (
    p_public_id, p_kind, p_request_key, p_payload_hash, nullif(p_name, ''),
    lower(p_email), p_details, p_marketing_email, v_now, v_now
  ) on conflict (request_key) do nothing
  returning id into v_id;
  v_created := v_id is not null;

  select * into v_existing from public_intakes where request_key = p_request_key for update;
  if not found then
    raise exception using errcode = '40001', message = 'Intake persistence must be retried.';
  end if;
  if v_existing.payload_hash <> p_payload_hash then
    raise exception using errcode = '23505', message = 'This request key was already used for different details. Refresh before sending a new request.';
  end if;
  if not v_created then
    return query select v_existing.public_id::text, false;
    return;
  end if;

  if p_kind = 'discount' then
    insert into launch_mail_outbox(message_key, recipient, subject, body, status, attempts, created_at, updated_at)
    values (
      'discount-' || p_public_id, lower(p_email),
      'Your first-clean offer: 10% off, up to $30', p_discount_body,
      'queued', 0, v_now, v_now
    ) on conflict (message_key) do nothing;
  end if;

  insert into launch_mail_outbox(message_key, recipient, subject, body, status, attempts, created_at, updated_at)
  values (
    'intake-staff-' || p_public_id, lower(p_staff_to),
    'New ' || p_kind || ' inquiry ' || p_public_id, p_staff_body,
    'queued', 0, v_now, v_now
  ) on conflict (message_key) do nothing;

  insert into audit_events(entity_type, entity_id, action, created_at, updated_at)
  values ('public_intake', v_existing.id, 'received', v_now, v_now);

  return query select p_public_id, true;
end;
$$;

create or replace function app.claim_launch_mail()
returns table(
  mail_id bigint,
  attempt_token uuid,
  message_key text,
  recipient text,
  subject text,
  body text,
  attempts smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_id bigint;
  v_token uuid := gen_random_uuid();
begin
  update launch_mail_outbox
  set status = case
      when first_attempt_at <= now() - interval '23 hours' then 'needs_reconciliation'
      else 'retrying'
    end,
    failure_reason = case
      when first_attempt_at <= now() - interval '23 hours' then 'provider_idempotency_window_expired'
      else 'stale_sender_recovered'
    end,
    updated_at = now()
  where status = 'sending' and last_attempt_at <= now() - interval '5 minutes';

  select outbox.id into v_id
  from launch_mail_outbox outbox
  where outbox.status in ('queued','retrying')
    and outbox.attempts < 3
    and (outbox.first_attempt_at is null or outbox.first_attempt_at > now() - interval '23 hours')
  order by outbox.created_at, outbox.id
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update launch_mail_outbox outbox
  set status = 'sending',
      attempts = outbox.attempts + 1,
      attempt_token = v_token,
      first_attempt_at = coalesce(outbox.first_attempt_at, now()),
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  where outbox.id = v_id;

  return query
    select outbox.id, outbox.attempt_token, outbox.message_key::text,
           outbox.recipient::text, outbox.subject::text, outbox.body,
           outbox.attempts
    from launch_mail_outbox outbox
    where outbox.id = v_id and outbox.attempt_token = v_token;
end;
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
  with changed as (
    update launch_mail_outbox
    set status = 'sent', provider_message_id = p_provider_message_id,
        sent_at = now(), failure_reason = null, updated_at = now()
    where id = p_mail_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_launch_mail_retry(
  p_mail_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update launch_mail_outbox
    set status = case when attempts >= 3 then 'needs_reconciliation' else 'retrying' end,
        failure_reason = left(coalesce(p_reason, 'transient_or_ambiguous_provider_error'), 255),
        updated_at = now()
    where id = p_mail_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_launch_mail_failed(
  p_mail_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update launch_mail_outbox
    set status = 'failed',
        failure_reason = left(coalesce(p_reason, 'permanent_provider_error'), 255),
        updated_at = now()
    where id = p_mail_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_started timestamptz;
  v_count integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 16 or length(p_bucket_key) > 128 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit bucket.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit policy.';
  end if;

  insert into api_rate_limits(bucket_key, window_started_at, request_count, expires_at)
  values (p_bucket_key, v_now, 1, v_now + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket_key) do update set
    window_started_at = case
      when api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now else api_rate_limits.window_started_at end,
    request_count = case
      when api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1 else api_rate_limits.request_count + 1 end,
    expires_at = v_now + make_interval(secs => p_window_seconds * 2)
  returning window_started_at, request_count into v_started, v_count;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    case when v_count <= p_limit then 0
         else greatest(1, ceil(extract(epoch from (v_started + make_interval(secs => p_window_seconds) - v_now)))::integer)
    end;
end;
$$;

create or replace function app.prune_api_rate_limits()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_count integer;
begin
  delete from api_rate_limits where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

commit;
