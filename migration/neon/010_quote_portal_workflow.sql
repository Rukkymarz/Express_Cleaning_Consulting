begin;

-- The original staff list exposed the public receipt but not the internal
-- request ID required by the quote endpoint. Replace it with the same paging
-- contract plus the IDs and current workflow state needed by the staff UI.
drop function if exists app.staff_list_leads(text,text,bigint,boolean,text,smallint,bigint,integer);

create function app.staff_list_leads(
  p_auth_user_id text,
  p_stage text default null,
  p_agent_id bigint default null,
  p_unassigned boolean default false,
  p_search text default null,
  p_cursor_score smallint default null,
  p_cursor_id bigint default null,
  p_limit integer default 26
)
returns table(
  id bigint, public_id text, name text, email text, phone text, source text,
  status text, pipeline_stage text, lead_score smallint, assigned_agent_id bigint,
  next_follow_up_at timestamptz, created_at timestamptz,
  service_request_id bigint, request_receipt text, service_name text,
  street text, unit text, city text, region text, postal_code text,
  task_id text, task_status text, notification_status text,
  customer_id bigint, customer_email text, customer_linked boolean,
  quote_id text, quote_status text, quote_total_cents bigint,
  quote_deposit_cents bigint, quote_expires_at timestamptz,
  booking_id text, booking_status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
begin
  perform app.require_permission(p_auth_user_id, 'leads.view');
  if p_stage is not null and p_stage not in ('new_lead','quote_requested','quote_sent','booked','completed') then
    raise exception using errcode = '22023', message = 'Invalid lead stage.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
     or length(coalesce(p_search, '')) > 100
     or ((p_cursor_score is null) <> (p_cursor_id is null))
     or (p_cursor_score is not null and (p_cursor_score < 0 or p_cursor_score > 255))
     or (p_cursor_id is not null and p_cursor_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;

  return query
  select lead.id, lead.public_id::text, lead.name::text, lead.email::text, lead.phone::text,
    lead.source::text, lead.status::text, lead.pipeline_stage::text, lead.lead_score,
    lead.assigned_agent_id, lead.next_follow_up_at, lead.created_at,
    request.id, request.public_id::text, service.name::text,
    address.street::text, address.unit::text, address.city::text,
    address.region::text, address.postal_code::text,
    task.public_id::text, task.status::text, notification.status::text,
    lead.customer_id, customer.email::text,
    (lead.customer_id is not null and customer.auth_user_id is not null),
    quote.public_id::text, quote.status::text, quote.total_cents,
    quote.deposit_cents, quote.expires_at,
    booking.public_id::text, booking.status::text
  from leads lead
  left join lateral (
    select latest.* from service_requests latest
    where latest.lead_id = lead.id order by latest.id desc limit 1
  ) request on true
  left join service_types service on service.id = request.service_type_id
  left join addresses address on address.id = request.address_id
  left join staff_tasks task on task.service_request_id = request.id and task.kind = 'quote_review'
  left join quote_request_notifications notification on notification.service_request_id = request.id
  left join users customer on customer.id = lead.customer_id
  left join lateral (
    select latest_quote.* from quotes latest_quote
    where latest_quote.service_request_id = request.id
    order by latest_quote.revision desc, latest_quote.id desc limit 1
  ) quote on true
  left join bookings booking on booking.quote_id = quote.id
  where (p_stage is null or lead.pipeline_stage = p_stage)
    and (p_agent_id is null or lead.assigned_agent_id = p_agent_id)
    and (not coalesce(p_unassigned, false) or lead.assigned_agent_id is null)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or position(lower(p_search) in lower(coalesce(lead.name, ''))) > 0
      or position(lower(p_search) in lower(coalesce(lead.email, ''))) > 0
      or position(lower(p_search) in lower(coalesce(lead.phone, ''))) > 0
      or position(lower(p_search) in lower(coalesce(request.public_id, ''))) > 0
    )
    and (
      p_cursor_score is null or p_cursor_id is null
      or lead.lead_score < p_cursor_score
      or (lead.lead_score = p_cursor_score and lead.id < p_cursor_id)
    )
  order by lead.lead_score desc, lead.id desc
  limit p_limit;
end;
$$;

-- Staff may link only an already-created, provider-linked and verified account
-- whose email exactly matches the lead. Identity creation remains a controlled
-- provider operation; this function never creates credentials or grants roles.
create or replace function app.staff_link_customer(
  p_auth_user_id text,
  p_lead_id bigint,
  p_customer_email text
)
returns table(customer_id bigint, customer_email text, linked boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_lead leads%rowtype;
  v_customer users%rowtype;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'quotes.issue');
  if p_lead_id is null or p_lead_id < 1
     or p_customer_email is null or length(trim(p_customer_email)) > 255
     or trim(p_customer_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter the verified customer account email.';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Lead not found.'; end if;
  if nullif(trim(coalesce(v_lead.email, '')), '') is null
     or lower(trim(v_lead.email)) <> lower(trim(p_customer_email)) then
    raise exception using errcode = '22023', message = 'Customer account email must match the lead email.';
  end if;

  select * into v_customer
  from users
  where lower(email) = lower(trim(p_customer_email))
    and auth_user_id is not null
    and email_verified_at is not null
  order by id
  limit 1
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'A verified invited customer account was not found for this email.';
  end if;
  if v_lead.customer_id is not null and v_lead.customer_id <> v_customer.id then
    raise exception using errcode = '23505', message = 'This lead is already linked to a different customer account.';
  end if;
  if v_lead.customer_id = v_customer.id then
    return query select v_customer.id, v_customer.email::text, false;
    return;
  end if;

  update leads set customer_id = v_customer.id, updated_at = now() where id = v_lead.id;
  update addresses address
  set user_id = v_customer.id, updated_at = now()
  where address.user_id is null and exists(
    select 1 from service_requests request
    where request.lead_id = v_lead.id and request.address_id = address.id
  );
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'lead', v_lead.id, 'customer.linked',
    jsonb_build_object('customer_id', v_customer.id), now(), now());
  perform app.sync_lead(v_lead.id);
  return query select v_customer.id, v_customer.email::text, true;
end;
$$;

create or replace function app.account_list_quotes(p_auth_user_id text)
returns table(
  quote_id text, status text, revision integer, currency text,
  subtotal_cents bigint, tax_cents bigint, total_cents bigint,
  deposit_cents bigint, expires_at timestamptz, accepted_at timestamptz,
  request_receipt text, service_name text, location text, items jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
begin
  v_user_id := app.require_user(p_auth_user_id);
  return query
  select quote.public_id::text, quote.status::text, quote.revision,
    quote.currency::text, quote.subtotal_cents, quote.tax_cents,
    quote.total_cents, quote.deposit_cents, quote.expires_at, quote.accepted_at,
    request.public_id::text, service.name::text,
    concat_ws(', ', nullif(address.street, ''), nullif(address.unit, ''),
      nullif(address.city, ''), nullif(address.region, ''), nullif(address.postal_code, ''))::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', item.description,
        'quantity', item.quantity,
        'unit_cents', item.unit_cents,
        'total_cents', item.total_cents
      ) order by item.id)
      from quote_items item where item.quote_id = quote.id
    ), '[]'::jsonb)
  from quotes quote
  join service_requests request on request.id = quote.service_request_id
  join leads lead on lead.id = request.lead_id
  join service_types service on service.id = request.service_type_id
  join addresses address on address.id = request.address_id
  where lead.customer_id = v_user_id
    and quote.status in ('sent','accepted','superseded')
  order by quote.id desc
  limit 50;
end;
$$;

revoke execute on function app.staff_list_leads(text,text,bigint,boolean,text,smallint,bigint,integer) from public;
revoke execute on function app.staff_link_customer(text,bigint,text) from public;
revoke execute on function app.account_list_quotes(text) from public;
grant execute on function app.staff_list_leads(text,text,bigint,boolean,text,smallint,bigint,integer) to ecc_edge_runtime;
grant execute on function app.staff_link_customer(text,bigint,text) to ecc_edge_runtime;
grant execute on function app.account_list_quotes(text) to ecc_edge_runtime;

commit;
