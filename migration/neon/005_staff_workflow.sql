begin;

create or replace function app.require_permission(p_auth_user_id text, p_permission text)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
begin
  select legacy.id into v_actor_id
  from users legacy
  where legacy.auth_user_id = p_auth_user_id
    and (
      exists(
        select 1 from model_has_permissions direct_grant
        join permissions permission on permission.id = direct_grant.permission_id
        where direct_grant.model_id = legacy.id
          and direct_grant.model_type = v_user_model
          and permission.name = p_permission and permission.guard_name = 'web'
      )
      or exists(
        select 1 from model_has_roles membership
        join role_has_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission on permission.id = role_permission.permission_id
        where membership.model_id = legacy.id
          and membership.model_type = v_user_model
          and permission.name = p_permission and permission.guard_name = 'web'
      )
    );
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'Staff permission denied.';
  end if;
  return v_actor_id;
end;
$$;

create or replace function app.require_user(p_auth_user_id text)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
begin
  select legacy.id into v_user_id
  from users legacy
  where legacy.auth_user_id = p_auth_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Account link required.';
  end if;
  return v_user_id;
end;
$$;

create or replace function app.staff_context(p_auth_user_id text)
returns table(user_id bigint, name text, email text, permissions text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.view');
  return query
  select legacy.id, legacy.name::text, legacy.email::text,
    array(
      select distinct permission_name from (
        select permission.name as permission_name
        from model_has_permissions direct_grant
        join permissions permission on permission.id = direct_grant.permission_id
        where direct_grant.model_id = legacy.id and direct_grant.model_type = v_user_model
        union
        select permission.name
        from model_has_roles membership
        join role_has_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission on permission.id = role_permission.permission_id
        where membership.model_id = legacy.id and membership.model_type = v_user_model
      ) effective order by permission_name
    )
  from users legacy where legacy.id = v_actor_id;
end;
$$;

create or replace function app.account_context(p_auth_user_id text)
returns table(user_id bigint, name text, email text, is_staff boolean, permissions text[])
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
  v_permissions text[];
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
begin
  v_user_id := app.require_user(p_auth_user_id);

  select array(
    select distinct permission_name
    from (
      select permission.name::text as permission_name
      from model_has_permissions direct_grant
      join permissions permission on permission.id = direct_grant.permission_id
      where direct_grant.model_id = v_user_id
        and direct_grant.model_type = v_user_model
      union
      select permission.name::text
      from model_has_roles membership
      join role_has_permissions role_permission on role_permission.role_id = membership.role_id
      join permissions permission on permission.id = role_permission.permission_id
      where membership.model_id = v_user_id
        and membership.model_type = v_user_model
    ) effective
    order by permission_name
  ) into v_permissions;

  return query
  select legacy.id,
    legacy.name::text,
    legacy.email::text,
    'leads.view' = any(v_permissions),
    v_permissions
  from users legacy
  where legacy.id = v_user_id;
end;
$$;

create or replace function app.staff_agents(p_auth_user_id text)
returns table(id bigint, name text, email text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
begin
  perform app.require_permission(p_auth_user_id, 'leads.view');
  return query
  select distinct legacy.id, legacy.name::text, legacy.email::text
  from users legacy
  where exists(
    select 1 from model_has_permissions direct_grant
    join permissions permission on permission.id = direct_grant.permission_id
    where direct_grant.model_id = legacy.id and direct_grant.model_type = v_user_model
      and permission.name = 'leads.edit' and permission.guard_name = 'web'
  ) or exists(
    select 1 from model_has_roles membership
    join role_has_permissions role_permission on role_permission.role_id = membership.role_id
    join permissions permission on permission.id = role_permission.permission_id
    where membership.model_id = legacy.id and membership.model_type = v_user_model
      and permission.name = 'leads.edit' and permission.guard_name = 'web'
  )
  order by legacy.name;
end;
$$;

create or replace function app.staff_list_leads(
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
  request_receipt text, service_name text, street text, unit text, city text,
  region text, postal_code text, task_id text, task_status text,
  notification_status text
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
    request.public_id::text, service.name::text, address.street::text, address.unit::text,
    address.city::text, address.region::text, address.postal_code::text,
    task.public_id::text, task.status::text, notification.status::text
  from leads lead
  left join lateral (
    select latest.* from service_requests latest
    where latest.lead_id = lead.id order by latest.id desc limit 1
  ) request on true
  left join service_types service on service.id = request.service_type_id
  left join addresses address on address.id = request.address_id
  left join staff_tasks task on task.service_request_id = request.id and task.kind = 'quote_review'
  left join quote_request_notifications notification on notification.service_request_id = request.id
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

create or replace function app.staff_update_lead(
  p_auth_user_id text,
  p_lead_id bigint,
  p_status text,
  p_next_follow_up_at timestamptz,
  p_set_follow_up boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_old leads%rowtype;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if p_set_follow_up is null or (p_status is null and not p_set_follow_up) then
    raise exception using errcode = '22023', message = 'Nothing to update.';
  end if;
  if p_status is not null and p_status not in ('new','contacted','qualified','follow_up','lost') then
    raise exception using errcode = '22023', message = 'Invalid lead status.';
  end if;
  select * into v_old from leads where id = p_lead_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Lead not found.'; end if;

  update leads set
    status = coalesce(p_status, status),
    next_follow_up_at = case when p_set_follow_up then p_next_follow_up_at else next_follow_up_at end,
    updated_at = now()
  where id = p_lead_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'lead', p_lead_id, 'disposition.updated',
    jsonb_build_object(
      'before', jsonb_build_object('status', v_old.status, 'next_follow_up_at', v_old.next_follow_up_at),
      'after', jsonb_build_object('status', p_status, 'next_follow_up_at', p_next_follow_up_at, 'set_follow_up', p_set_follow_up)
    ), now(), now());
  perform app.sync_lead(p_lead_id);
end;
$$;

create or replace function app.staff_assign_lead(
  p_auth_user_id text,
  p_lead_id bigint,
  p_agent_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_old_agent bigint;
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if not exists(
    select 1 from users target
    where target.id = p_agent_id and (
      exists(
        select 1 from model_has_permissions direct_grant
        join permissions permission on permission.id = direct_grant.permission_id
        where direct_grant.model_id = target.id and direct_grant.model_type = v_user_model
          and permission.name = 'leads.edit' and permission.guard_name = 'web'
      ) or exists(
        select 1 from model_has_roles membership
        join role_has_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission on permission.id = role_permission.permission_id
        where membership.model_id = target.id and membership.model_type = v_user_model
          and permission.name = 'leads.edit' and permission.guard_name = 'web'
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'Assign to an approved sales agent.';
  end if;
  select assigned_agent_id into v_old_agent from leads where id = p_lead_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Lead not found.'; end if;
  update leads set assigned_agent_id = p_agent_id, updated_at = now() where id = p_lead_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'lead', p_lead_id, 'agent.assigned',
    jsonb_build_object('from', v_old_agent, 'to', p_agent_id), now(), now());
  perform app.sync_lead(p_lead_id);
  return p_agent_id;
end;
$$;

create or replace function app.staff_update_task(
  p_auth_user_id text,
  p_task_public_id text,
  p_status text
)
returns table(task_id text, status text, completed_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_task staff_tasks%rowtype;
  v_completed timestamptz;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if p_status is null or p_status not in ('open','in_progress','completed') then
    raise exception using errcode = '22023', message = 'Invalid task status.';
  end if;
  select * into v_task from staff_tasks where public_id = p_task_public_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Task not found.'; end if;
  v_completed := case when p_status = 'completed' then now() else null end;
  update staff_tasks set status = p_status, completed_at = v_completed, updated_at = now()
  where id = v_task.id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'staff_task', v_task.id, 'status.updated',
    jsonb_build_object('from', v_task.status, 'to', p_status), now(), now());
  return query select p_task_public_id, p_status, v_completed;
end;
$$;

create or replace function app.staff_list_inquiries(
  p_auth_user_id text,
  p_kind text default null,
  p_page integer default 1,
  p_per_page integer default 30
)
returns table(
  public_id text, kind text, name text, email text, status text,
  details jsonb, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
begin
  perform app.require_permission(p_auth_user_id, 'leads.view');
  if p_kind is not null and p_kind not in ('discount','partner','referral','vendor') then
    raise exception using errcode = '22023', message = 'Invalid inquiry kind.';
  end if;
  if p_page is null or p_page < 1 or p_per_page is null or p_per_page < 1 or p_per_page > 100 then
    raise exception using errcode = '22023', message = 'Invalid pagination.';
  end if;
  return query
  select inquiry.public_id::text, inquiry.kind::text, inquiry.name::text,
    inquiry.email::text, inquiry.status::text, inquiry.details, inquiry.created_at,
    count(*) over() as total_count
  from public_intakes inquiry
  where p_kind is null or inquiry.kind = p_kind
  order by inquiry.id desc
  limit p_per_page offset ((p_page - 1) * p_per_page);
end;
$$;

create or replace function app.staff_update_inquiry(
  p_auth_user_id text,
  p_public_id text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_inquiry public_intakes%rowtype;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if p_status is null or p_status not in ('open','in_progress','completed') then
    raise exception using errcode = '22023', message = 'Invalid inquiry status.';
  end if;
  select * into v_inquiry from public_intakes where public_id = p_public_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Inquiry not found.'; end if;
  update public_intakes set status = p_status, updated_at = now() where id = v_inquiry.id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'public_intake', v_inquiry.id, 'status.updated',
    jsonb_build_object('from', v_inquiry.status, 'to', p_status), now(), now());
end;
$$;

create or replace function app.staff_list_prospects(
  p_auth_user_id text,
  p_segment text default null,
  p_queue text default 'all',
  p_before timestamptz default null,
  p_region text default null,
  p_search text default null,
  p_cursor_priority integer default null,
  p_cursor_id bigint default null,
  p_limit integer default 26
)
returns table(
  id bigint, name text, segment text, email text, phone text, city text,
  region text, service_interest text, source text, status text, notes text,
  assigned_agent_id bigint, next_follow_up_at timestamptz,
  territory_priority integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
begin
  perform app.require_permission(p_auth_user_id, 'leads.view');
  if p_segment is not null and p_segment not in ('residential','commercial') then
    raise exception using errcode = '22023', message = 'Invalid prospect segment.';
  end if;
  if p_queue is null or p_queue not in ('all','new','due') or (p_queue = 'due' and p_before is null) then
    raise exception using errcode = '22023', message = 'Invalid prospect queue.';
  end if;
  if p_region is not null and p_region not in ('GA','MI') then
    raise exception using errcode = '22023', message = 'Invalid prospect region.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
     or length(coalesce(p_search, '')) > 100
     or ((p_cursor_priority is null) <> (p_cursor_id is null))
     or (p_cursor_priority is not null and (p_cursor_priority < 0 or p_cursor_priority > 2))
     or (p_cursor_id is not null and p_cursor_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid page size.';
  end if;

  return query
  with prioritized as (
    select prospect.*,
      case when prospect.region = 'GA' then 0 when prospect.region = 'MI' then 1 else 2 end as priority
    from sales_prospects prospect
    where (p_segment is null or prospect.segment = p_segment)
      and (p_region is null or prospect.region = p_region)
      and (p_queue <> 'new' or prospect.status = 'new')
      and (p_queue <> 'due' or (
        prospect.status not in ('not_interested','do_not_contact','converted')
        and prospect.next_follow_up_at is not null and prospect.next_follow_up_at <= p_before
      ))
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(p_search) in lower(coalesce(prospect.name, ''))) > 0
        or position(lower(p_search) in lower(coalesce(prospect.email, ''))) > 0
        or position(lower(p_search) in lower(coalesce(prospect.phone, ''))) > 0
        or position(lower(p_search) in lower(coalesce(prospect.city, ''))) > 0
      )
  )
  select prospect.id, prospect.name::text, prospect.segment::text,
    prospect.email::text, prospect.phone::text, prospect.city::text,
    prospect.region::text, prospect.service_interest::text, prospect.source::text,
    prospect.status::text, prospect.notes, prospect.assigned_agent_id,
    prospect.next_follow_up_at, prospect.priority
  from prioritized prospect
  where p_cursor_priority is null or p_cursor_id is null
    or prospect.priority > p_cursor_priority
    or (prospect.priority = p_cursor_priority and prospect.id < p_cursor_id)
  order by prospect.priority, prospect.id desc
  limit p_limit;
end;
$$;

create or replace function app.staff_create_prospect(
  p_auth_user_id text,
  p_name text,
  p_segment text,
  p_email text,
  p_phone text,
  p_city text,
  p_region text,
  p_source text,
  p_service_interest text,
  p_notes text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_id bigint;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if p_name is null or trim(p_name) = '' or length(p_name) > 255
     or p_segment is null or p_segment not in ('residential','commercial')
     or (nullif(p_email, '') is null and nullif(p_phone, '') is null)
     or length(coalesce(p_email, '')) > 255
     or (nullif(p_email, '') is not null and p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or length(coalesce(p_phone, '')) > 32
     or (nullif(p_phone, '') is not null and p_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$')
     or length(coalesce(p_city, '')) > 255
     or (nullif(p_region, '') is not null and p_region !~ '^[A-Z]{2}$')
     or p_source is null or trim(p_source) = '' or length(p_source) > 500
     or p_service_interest is null
     or p_service_interest not in ('Cleaning','Deep cleaning','Office cleaning','Move-in/out cleaning','Junk removal','Pressure washing','Other')
     or length(coalesce(p_notes, '')) > 5000 then
    raise exception using errcode = '22023', message = 'Invalid prospect details.';
  end if;
  if exists(
    select 1 from sales_prospects existing
    where (nullif(p_email, '') is not null and lower(existing.email) = lower(p_email))
       or (nullif(p_phone, '') is not null and existing.phone = p_phone)
  ) then
    raise exception using errcode = '23505', message = 'This contact is already in Lead generation. Search for the existing record.';
  end if;

  insert into sales_prospects(
    name, segment, email, phone, city, region, service_interest, source,
    status, notes, assigned_agent_id, created_at, updated_at
  ) values (
    trim(p_name), p_segment, nullif(lower(p_email), ''), nullif(p_phone, ''),
    nullif(p_city, ''), nullif(upper(p_region), ''), p_service_interest,
    trim(p_source), 'new', nullif(p_notes, ''), v_actor_id, now(), now()
  ) returning id into v_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'sales_prospect', v_id, 'created', jsonb_build_object('segment', p_segment), now(), now());
  return v_id;
end;
$$;

create or replace function app.staff_update_prospect(
  p_auth_user_id text,
  p_prospect_id bigint,
  p_status text,
  p_notes text,
  p_set_notes boolean,
  p_next_follow_up_at timestamptz,
  p_set_follow_up boolean,
  p_assigned_agent_id bigint,
  p_set_assigned_agent boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_old sales_prospects%rowtype;
  v_user_model text := 'App' || chr(92) || 'Models' || chr(92) || 'User';
  v_effective_status text;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  if p_set_notes is null or p_set_follow_up is null or p_set_assigned_agent is null
     or (p_status is null and not p_set_notes and not p_set_follow_up and not p_set_assigned_agent) then
    raise exception using errcode = '22023', message = 'Nothing to update.';
  end if;
  if p_status is not null and p_status not in ('new','contacted','follow_up','interested','not_interested','do_not_contact') then
    raise exception using errcode = '22023', message = 'Invalid prospect status.';
  end if;
  if p_set_assigned_agent and not exists(
    select 1 from users target
    where target.id = p_assigned_agent_id and (
      exists(
        select 1 from model_has_permissions direct_grant
        join permissions permission on permission.id = direct_grant.permission_id
        where direct_grant.model_id = target.id and direct_grant.model_type = v_user_model
          and permission.name = 'leads.edit' and permission.guard_name = 'web'
      ) or exists(
        select 1 from model_has_roles membership
        join role_has_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission on permission.id = role_permission.permission_id
        where membership.model_id = target.id and membership.model_type = v_user_model
          and permission.name = 'leads.edit' and permission.guard_name = 'web'
      )
    )
  ) then
    raise exception using errcode = '22023', message = 'Assign to an approved sales agent.';
  end if;

  select * into v_old from sales_prospects where id = p_prospect_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Prospect not found.'; end if;
  if v_old.status = 'converted' then
    raise exception using errcode = '22023', message = 'This prospect has moved to the lead pipeline. Update it there.';
  end if;
  v_effective_status := coalesce(p_status, v_old.status);
  update sales_prospects set
    status = v_effective_status,
    notes = case when p_set_notes then nullif(p_notes, '') else notes end,
    next_follow_up_at = case
      when v_effective_status = 'do_not_contact' then null
      when p_set_follow_up then p_next_follow_up_at else next_follow_up_at end,
    assigned_agent_id = case when p_set_assigned_agent then p_assigned_agent_id else assigned_agent_id end,
    updated_at = now()
  where id = p_prospect_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'sales_prospect', p_prospect_id, 'updated',
    jsonb_build_object(
      'status', p_status, 'notes_changed', p_set_notes,
      'next_follow_up_at', p_next_follow_up_at, 'follow_up_changed', p_set_follow_up,
      'assigned_agent_id', p_assigned_agent_id, 'assignment_changed', p_set_assigned_agent
    ), now(), now());
end;
$$;

create or replace function app.staff_convert_prospect(
  p_auth_user_id text,
  p_prospect_id bigint,
  p_lead_public_id text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_prospect sales_prospects%rowtype;
  v_lead_id bigint;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.edit');
  select * into v_prospect from sales_prospects where id = p_prospect_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Prospect not found.'; end if;
  if v_prospect.lead_id is not null then return v_prospect.lead_id; end if;
  if v_prospect.status <> 'interested' then
    raise exception using errcode = '22023', message = 'Mark the prospect interested before moving it to the pipeline.';
  end if;
  if p_lead_public_id is null or p_lead_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid lead receipt.';
  end if;

  select lead.id into v_lead_id
  from leads lead
  where (v_prospect.email is not null and lower(lead.email) = lower(v_prospect.email))
     or (v_prospect.phone is not null and lead.phone = v_prospect.phone)
  order by lead.id
  limit 1;
  if v_lead_id is null then
    insert into leads(
      public_id, name, email, phone, source, status, pipeline_stage,
      lead_score, assigned_agent_id, next_follow_up_at, created_at, updated_at
    ) values (
      p_lead_public_id, v_prospect.name, v_prospect.email, v_prospect.phone,
      'staff_prospect', 'qualified', 'new_lead',
      (case when v_prospect.email is not null then 10 else 0 end) +
      (case when v_prospect.phone is not null then 10 else 0 end),
      v_prospect.assigned_agent_id, v_prospect.next_follow_up_at, now(), now()
    ) returning id into v_lead_id;
  end if;
  update sales_prospects
  set lead_id = v_lead_id, status = 'converted', next_follow_up_at = null, updated_at = now()
  where id = p_prospect_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'sales_prospect', p_prospect_id, 'converted',
    jsonb_build_object('lead_id', v_lead_id), now(), now());
  perform app.sync_lead(v_lead_id);
  return v_lead_id;
end;
$$;

create or replace function app.staff_approved_workers(p_auth_user_id text)
returns table(id bigint, name text, email text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
begin
  perform app.require_permission(p_auth_user_id, 'bookings.dispatch');
  return query
  select worker.id, staff.name::text, staff.email::text
  from workers worker
  join users staff on staff.id = worker.user_id
  where worker.approval_status = 'approved'
  order by staff.name, worker.id;
end;
$$;

create or replace function app.staff_create_service_plan(
  p_auth_user_id text,
  p_booking_id bigint,
  p_plan_public_id text,
  p_next_service_on date,
  p_customer_approved boolean
)
returns table(plan_id text, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_booking record;
  v_plan service_plans%rowtype;
  v_plan_id bigint;
  v_now timestamptz := now();
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'bookings.dispatch');
  if p_booking_id is null or p_booking_id < 1
     or p_plan_public_id is null or p_plan_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_customer_approved is distinct from true
     or (p_next_service_on is not null and p_next_service_on <= current_date) then
    raise exception using errcode = '22023', message = 'Invalid recurring plan request.';
  end if;

  select booking.id, booking.customer_id, booking.status, request.frequency
  into v_booking
  from bookings booking
  join quotes quote on quote.id = booking.quote_id
  join service_requests request on request.id = quote.service_request_id
  where booking.id = p_booking_id
  for update of booking;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found.'; end if;
  if v_booking.customer_id is null or v_booking.status <> 'completed'
     or v_booking.frequency is null
     or v_booking.frequency not in ('weekly','biweekly','monthly','recurring_commercial') then
    raise exception using errcode = '22023', message = 'A completed recurring service with a linked customer is required.';
  end if;

  select * into v_plan from service_plans where originating_booking_id = p_booking_id for update;
  if found then
    return query select v_plan.public_id::text, v_plan.status::text, false;
    return;
  end if;

  insert into service_plans(
    public_id, customer_id, originating_booking_id, frequency, status,
    next_service_on, created_at, updated_at
  ) values (
    p_plan_public_id, v_booking.customer_id, p_booking_id, v_booking.frequency,
    'active', p_next_service_on, v_now, v_now
  ) returning id into v_plan_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'service_plan', v_plan_id, 'created.with_customer_approval',
    jsonb_build_object('originating_booking_id', p_booking_id), v_now, v_now);
  return query select p_plan_public_id, 'active'::text, true;
end;
$$;

create or replace function app.staff_resolve_plan_change(
  p_auth_user_id text,
  p_change_id bigint,
  p_decision text,
  p_next_service_on date
)
returns table(request_id bigint, status text, plan_status text, resolved boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_change plan_change_requests%rowtype;
  v_plan service_plans%rowtype;
  v_request_status text;
  v_target_status text;
  v_now timestamptz := now();
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'bookings.dispatch');
  if p_change_id is null or p_change_id < 1
     or p_decision is null or p_decision not in ('approve','decline')
     or (p_next_service_on is not null and p_next_service_on <= current_date) then
    raise exception using errcode = '22023', message = 'Invalid plan resolution.';
  end if;
  select * into v_change from plan_change_requests where id = p_change_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Plan change request not found.'; end if;
  select * into v_plan from service_plans where id = v_change.service_plan_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Service plan not found.'; end if;

  v_request_status := case when p_decision = 'approve' then 'approved' else 'declined' end;
  if v_change.status <> 'pending' then
    if v_change.status = v_request_status then
      return query select v_change.id, v_change.status::text, v_plan.status::text, false;
      return;
    end if;
    raise exception using errcode = '22023', message = 'Plan change request was already resolved differently.';
  end if;

  if p_decision = 'decline' then
    if p_next_service_on is not null then
      raise exception using errcode = '22023', message = 'A declined change cannot set a service date.';
    end if;
    v_target_status := v_plan.status;
  else
    v_target_status := case v_change.action
      when 'pause' then 'paused'
      when 'resume' then 'active'
      when 'cancel' then 'cancelled'
      else null
    end;
    if v_target_status is null
       or v_plan.status = 'cancelled'
       or (v_change.action = 'pause' and v_plan.status <> 'active')
       or (v_change.action = 'resume' and v_plan.status <> 'paused')
       or (v_change.action = 'cancel' and p_next_service_on is not null) then
      raise exception using errcode = '22023', message = 'Plan state changed before this request was resolved.';
    end if;
    update service_plans
    set status = v_target_status,
      next_service_on = case
        when v_target_status = 'cancelled' then null
        when p_next_service_on is not null then p_next_service_on
        else next_service_on
      end,
      updated_at = v_now
    where id = v_plan.id;
  end if;

  update plan_change_requests
  set status = v_request_status, resolved_by = v_actor_id,
    resolved_at = v_now, updated_at = v_now
  where id = v_change.id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'service_plan', v_plan.id, 'change.' || p_decision,
    jsonb_build_object('requested_action', v_change.action, 'from', v_plan.status, 'to', v_target_status),
    v_now, v_now);
  return query select v_change.id, v_request_status, v_target_status, true;
end;
$$;

create or replace function app.account_list_bookings(
  p_auth_user_id text,
  p_cursor_id bigint default null,
  p_limit integer default 21
)
returns table(
  internal_id bigint, public_id text, status text, start_at timestamptz,
  end_at timestamptz, time_zone text, balance_due_cents bigint
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
  if p_limit is null or p_limit < 1 or p_limit > 51
     or (p_cursor_id is not null and p_cursor_id < 1) then
    raise exception using errcode = '22023', message = 'Invalid account page.';
  end if;
  return query
  select booking.id, booking.public_id::text, booking.status::text,
    booking.start_at, booking.end_at, booking.time_zone::text,
    greatest(0::bigint, quote.total_cents - coalesce((
      select sum(payment.amount_cents - payment.refunded_cents)
      from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
        and payment.status in ('succeeded','partially_refunded')
    ), 0))
  from bookings booking
  join quotes quote on quote.id = booking.quote_id
  where booking.customer_id = v_user_id
    and (p_cursor_id is null or booking.id < p_cursor_id)
  order by booking.id desc
  limit p_limit;
end;
$$;

create or replace function app.account_get_booking(
  p_auth_user_id text,
  p_booking_public_id text
)
returns table(
  public_id text, status text, total_cents bigint, deposit_cents bigint,
  balance_due_cents bigint, hosted_invoice_url text, payment_status text,
  test_hosted_invoice_url text, test_payment_status text
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
  if p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid booking receipt.';
  end if;
  return query
  select booking.public_id::text, booking.status::text, quote.total_cents,
    quote.deposit_cents,
    greatest(0::bigint, quote.total_cents - coalesce((
      select sum(payment.amount_cents - payment.refunded_cents)
      from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
        and payment.status in ('succeeded','partially_refunded')
    ), 0)),
    (select payment.hosted_invoice_url from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
        and payment.hosted_invoice_url is not null order by payment.id desc limit 1),
    (select payment.status::text from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
      order by payment.id desc limit 1),
    (select payment.hosted_invoice_url from payments payment
      where payment.booking_id = booking.id and payment.environment = 'test'
        and payment.hosted_invoice_url is not null order by payment.id desc limit 1),
    (select payment.status::text from payments payment
      where payment.booking_id = booking.id and payment.environment = 'test'
      order by payment.id desc limit 1)
  from bookings booking
  join quotes quote on quote.id = booking.quote_id
  where booking.public_id = p_booking_public_id and booking.customer_id = v_user_id;
end;
$$;

create or replace function app.account_list_payments(
  p_auth_user_id text,
  p_booking_public_id text
)
returns table(
  kind text, environment text, status text, amount_cents bigint,
  currency text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
  v_booking_id bigint;
begin
  v_user_id := app.require_user(p_auth_user_id);
  if p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid booking receipt.';
  end if;
  select booking.id into v_booking_id from bookings booking
  where booking.public_id = p_booking_public_id and booking.customer_id = v_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found.'; end if;
  return query
  select payment.kind::text, payment.environment::text, payment.status::text,
    payment.amount_cents, payment.currency::text, payment.created_at
  from payments payment where payment.booking_id = v_booking_id
  order by payment.id desc;
end;
$$;

create or replace function app.account_get_invoice(
  p_auth_user_id text,
  p_booking_public_id text
)
returns table(
  invoice_number text, currency text, subtotal_cents bigint, tax_cents bigint,
  total_cents bigint, paid_cents bigint, balance_due_cents bigint,
  issued_at timestamptz, due_at timestamptz, service_at timestamptz,
  time_zone text, customer_name text, customer_email text,
  street text, unit text, city text, region text, postal_code text
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
  if p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid booking receipt.';
  end if;
  return query
  select invoice.number::text, invoice.currency::text,
    invoice.subtotal_cents, invoice.tax_cents, invoice.total_cents,
    coalesce((
      select sum(payment.amount_cents - payment.refunded_cents)
      from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
        and payment.status in ('succeeded','partially_refunded')
    ), 0)::bigint as paid_cents,
    greatest(0::bigint, invoice.total_cents - coalesce((
      select sum(payment.amount_cents - payment.refunded_cents)
      from payments payment
      where payment.booking_id = booking.id and payment.environment = 'live'
        and payment.status in ('succeeded','partially_refunded')
    ), 0)) as balance_due_cents,
    invoice.issued_at, invoice.due_at, booking.start_at, booking.time_zone::text,
    customer.name::text, customer.email::text,
    address.street::text, address.unit::text, address.city::text,
    address.region::text, address.postal_code::text
  from bookings booking
  join invoices invoice on invoice.booking_id = booking.id
  join quotes quote on quote.id = booking.quote_id
  join service_requests request on request.id = quote.service_request_id
  join addresses address on address.id = request.address_id
  join users customer on customer.id = booking.customer_id
  where booking.public_id = p_booking_public_id and booking.customer_id = v_user_id;
end;
$$;

create or replace function app.account_list_invoice_items(
  p_auth_user_id text,
  p_booking_public_id text
)
returns table(description text, quantity integer, unit_cents bigint, total_cents bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
  v_quote_id bigint;
begin
  v_user_id := app.require_user(p_auth_user_id);
  if p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid booking receipt.';
  end if;
  select booking.quote_id into v_quote_id
  from bookings booking
  where booking.public_id = p_booking_public_id and booking.customer_id = v_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found.'; end if;
  return query
  select item.description::text, item.quantity, item.unit_cents, item.total_cents
  from quote_items item where item.quote_id = v_quote_id order by item.id;
end;
$$;

create or replace function app.account_list_plans(p_auth_user_id text)
returns table(
  id bigint, public_id text, frequency text, status text,
  next_service_on date, booking_id text
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
  select plan.id, plan.public_id::text, plan.frequency::text, plan.status::text,
    plan.next_service_on, booking.public_id::text
  from service_plans plan
  join bookings booking on booking.id = plan.originating_booking_id
  where plan.customer_id = v_user_id
  order by plan.id desc;
end;
$$;

create or replace function app.account_list_pending_plan_changes(p_auth_user_id text)
returns table(service_plan_id bigint, action text, created_at timestamptz)
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
  select change.service_plan_id, change.action::text, change.created_at
  from plan_change_requests change
  join service_plans plan on plan.id = change.service_plan_id
  where plan.customer_id = v_user_id and change.status = 'pending'
  order by change.id desc;
end;
$$;

create or replace function app.account_request_plan_change(
  p_auth_user_id text,
  p_plan_public_id text,
  p_action text,
  p_reason text
)
returns table(request_id bigint, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
  v_plan service_plans%rowtype;
  v_pending plan_change_requests%rowtype;
  v_request_id bigint;
  v_now timestamptz := now();
begin
  v_user_id := app.require_user(p_auth_user_id);
  if p_plan_public_id is null or p_plan_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_action is null or p_action not in ('pause','resume','cancel')
     or length(coalesce(p_reason, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Invalid plan change request.';
  end if;
  select * into v_plan from service_plans
  where public_id = p_plan_public_id and customer_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Service plan not found.'; end if;
  if v_plan.status = 'cancelled'
     or (p_action = 'pause' and v_plan.status <> 'active')
     or (p_action = 'resume' and v_plan.status <> 'paused') then
    raise exception using errcode = '22023', message = 'This change is unavailable.';
  end if;
  select * into v_pending from plan_change_requests
  where service_plan_id = v_plan.id and status = 'pending'
  order by id desc limit 1 for update;
  if found then
    if v_pending.action = p_action and coalesce(v_pending.reason, '') = coalesce(nullif(p_reason, ''), '') then
      return query select v_pending.id, 'pending_review'::text, false;
      return;
    end if;
    raise exception using errcode = '22023', message = 'A plan change is already pending.';
  end if;
  insert into plan_change_requests(
    service_plan_id, requested_by, action, status, reason, created_at, updated_at
  ) values (
    v_plan.id, v_user_id, p_action, 'pending', nullif(p_reason, ''), v_now, v_now
  ) returning id into v_request_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_user_id, 'service_plan', v_plan.id, 'change.requested',
    jsonb_build_object('requested_action', p_action), v_now, v_now);
  return query select v_request_id, 'pending_review'::text, true;
end;
$$;

create or replace function app.staff_issue_quote(
  p_auth_user_id text,
  p_service_request_id bigint,
  p_quote_public_id text,
  p_idempotency_key text,
  p_items jsonb,
  p_tax_cents bigint,
  p_deposit_cents bigint,
  p_expires_at timestamptz
)
returns table(
  quote_id text, revision integer, total_cents bigint,
  deposit_cents bigint, status text, created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_now timestamptz := now();
  v_request service_requests%rowtype;
  v_event_id bigint;
  v_existing_quote_id text;
  v_existing_hash text;
  v_payload_hash text;
  v_item jsonb;
  v_description text;
  v_quantity integer;
  v_unit_cents bigint;
  v_subtotal bigint := 0;
  v_total bigint;
  v_revision integer;
  v_quote_id bigint;
  v_quote quotes%rowtype;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'quotes.issue');
  if p_service_request_id is null or p_service_request_id < 1
     or p_quote_public_id is null or p_quote_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 120
     or p_idempotency_key !~ '^[!-~]+$'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30
     or p_tax_cents is null or p_tax_cents < 0 or p_tax_cents > 100000000
     or p_deposit_cents is null or p_deposit_cents < 0 or p_deposit_cents > 100000000
     or p_expires_at is null or p_expires_at <= v_now then
    raise exception using errcode = '22023', message = 'Invalid quote details.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or trim(coalesce(v_item->>'description', '')) = ''
       or length(v_item->>'description') > 255
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$'
       or length(coalesce(v_item->>'quantity', '')) > 4
       or coalesce(v_item->>'unit_cents', '') !~ '^[0-9]+$'
       or length(coalesce(v_item->>'unit_cents', '')) > 9 then
      raise exception using errcode = '22023', message = 'Invalid quote line item.';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_cents := (v_item->>'unit_cents')::bigint;
    if v_quantity < 1 or v_quantity > 9999 or v_unit_cents < 0 or v_unit_cents > 100000000 then
      raise exception using errcode = '22023', message = 'Invalid quote line item.';
    end if;
    v_subtotal := v_subtotal + (v_quantity::bigint * v_unit_cents);
  end loop;
  v_total := v_subtotal + p_tax_cents;
  if v_total < 50 or p_deposit_cents > v_total then
    raise exception using errcode = '22023', message = 'Invalid quote amount.';
  end if;

  v_payload_hash := encode(digest(jsonb_build_object(
    'service_request_id', p_service_request_id,
    'items', p_items,
    'tax_cents', p_tax_cents,
    'deposit_cents', p_deposit_cents,
    'expires_at', p_expires_at
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('staff_quote:' || p_idempotency_key, 0));

  select event.id, audit.action, audit.changes->>'payload_hash'
  into v_event_id, v_existing_quote_id, v_existing_hash
  from provider_events event
  left join audit_events audit
    on audit.entity_type = 'staff_quote_receipt' and audit.entity_id = event.id
  where event.provider = 'staff_quote' and event.event_id = p_idempotency_key;
  if v_event_id is not null then
    if v_existing_quote_id is null then
      raise exception using errcode = '40001', message = 'The original quote is still being committed; retry safely.';
    end if;
    if v_existing_hash is not null and v_existing_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'This Idempotency-Key was already used for a different quote.';
    end if;
    select * into v_quote from quotes where public_id = v_existing_quote_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'The original quote could not be found.';
    end if;
    return query select v_quote.public_id::text, v_quote.revision, v_quote.total_cents,
      v_quote.deposit_cents, v_quote.status::text, false;
    return;
  end if;

  select * into v_request from service_requests where id = p_service_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Service request not found.'; end if;
  if exists(select 1 from quotes where service_request_id = v_request.id and status = 'accepted') then
    raise exception using errcode = '22023', message = 'An accepted quote already exists.';
  end if;

  insert into provider_events(provider, event_id, event_type, created_at, updated_at)
  values ('staff_quote', p_idempotency_key, 'quote.issued', v_now, v_now)
  returning id into v_event_id;
  update quotes set status = 'superseded', updated_at = v_now
  where service_request_id = v_request.id and status in ('draft','sent');
  select coalesce(max(existing.revision), 0) + 1 into v_revision
  from quotes existing where existing.service_request_id = v_request.id;

  insert into quotes(
    public_id, service_request_id, approved_by, revision, status, currency,
    subtotal_cents, tax_cents, total_cents, deposit_cents, expires_at,
    created_at, updated_at
  ) values (
    p_quote_public_id, v_request.id, v_actor_id, v_revision, 'sent', 'USD',
    v_subtotal, p_tax_cents, v_total, p_deposit_cents, p_expires_at,
    v_now, v_now
  ) returning id into v_quote_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := trim(v_item->>'description');
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_cents := (v_item->>'unit_cents')::bigint;
    insert into quote_items(quote_id, description, quantity, unit_cents, total_cents)
    values (v_quote_id, v_description, v_quantity, v_unit_cents, v_quantity::bigint * v_unit_cents);
  end loop;

  update service_requests set status = 'quoted', updated_at = v_now where id = v_request.id;
  update provider_events set processed_at = v_now, updated_at = v_now where id = v_event_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'quote', v_quote_id, 'issued',
    jsonb_build_object('total_cents', v_total, 'revision', v_revision), v_now, v_now);
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'staff_quote_receipt', v_event_id, p_quote_public_id,
    jsonb_build_object('payload_hash', v_payload_hash), v_now, v_now);
  perform app.sync_lead(v_request.lead_id);

  return query select p_quote_public_id, v_revision, v_total, p_deposit_cents, 'sent'::text, true;
end;
$$;

create or replace function app.customer_accept_quote(
  p_auth_user_id text,
  p_quote_public_id text
)
returns table(quote_id text, status text, next_step text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_user_id bigint;
  v_quote record;
  v_now timestamptz := now();
begin
  v_user_id := app.require_user(p_auth_user_id);
  if p_quote_public_id is null or p_quote_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid quote receipt.';
  end if;
  select quote.id, quote.public_id, quote.service_request_id, quote.status,
    quote.expires_at, request.lead_id
  into v_quote
  from quotes quote
  join service_requests request on request.id = quote.service_request_id
  join leads lead on lead.id = request.lead_id
  where quote.public_id = p_quote_public_id and lead.customer_id = v_user_id
  for update of quote, request;
  if not found then raise exception using errcode = 'P0002', message = 'Quote not found.'; end if;
  if v_quote.status = 'accepted' then
    return query select v_quote.public_id::text, 'accepted'::text, 'availability_confirmation'::text;
    return;
  end if;
  if v_quote.status <> 'sent' or v_quote.expires_at <= v_now then
    raise exception using errcode = '22023', message = 'Quote unavailable.';
  end if;
  if exists(
    select 1 from quotes other
    where other.service_request_id = v_quote.service_request_id
      and other.id <> v_quote.id and other.status = 'accepted'
  ) then
    raise exception using errcode = '22023', message = 'Another quote is already accepted.';
  end if;

  update quotes set status = 'superseded', updated_at = v_now
  where service_request_id = v_quote.service_request_id and id <> v_quote.id and status = 'sent';
  update quotes set status = 'accepted', accepted_at = v_now, updated_at = v_now
  where id = v_quote.id;
  update service_requests set status = 'accepted', updated_at = v_now
  where id = v_quote.service_request_id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_user_id, 'quote', v_quote.id, 'accepted', null, v_now, v_now);
  perform app.sync_lead(v_quote.lead_id);
  return query select v_quote.public_id::text, 'accepted'::text, 'availability_confirmation'::text;
end;
$$;

create or replace function app.staff_prepare_booking(
  p_auth_user_id text,
  p_quote_public_id text,
  p_worker_id bigint,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_time_zone text,
  p_booking_public_id text,
  p_invoice_public_id text
)
returns table(booking_id text, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_quote quotes%rowtype;
  v_worker workers%rowtype;
  v_customer_id bigint;
  v_existing record;
  v_booking_id bigint;
  v_lead_id bigint;
  v_now timestamptz := now();
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'bookings.dispatch');
  if p_quote_public_id is null or p_quote_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_worker_id is null or p_worker_id < 1
     or p_start_at is null or p_end_at is null or p_start_at <= v_now or p_end_at <= p_start_at
     or p_time_zone is null or length(p_time_zone) > 100
     or not exists(select 1 from pg_timezone_names where name = p_time_zone)
     or p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_invoice_public_id is null or p_invoice_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$' then
    raise exception using errcode = '22023', message = 'Invalid booking details.';
  end if;

  select * into v_quote from quotes where public_id = p_quote_public_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Quote not found.'; end if;
  if v_quote.status <> 'accepted' then
    raise exception using errcode = '22023', message = 'The quote must be accepted before booking.';
  end if;
  select * into v_worker from workers where id = p_worker_id for update;
  if not found or v_worker.approval_status <> 'approved' then
    raise exception using errcode = '22023', message = 'Worker is not approved.';
  end if;

  select booking.id, booking.public_id, booking.status, booking.start_at,
    booking.end_at, booking.time_zone, assignment.worker_id
  into v_existing
  from bookings booking
  left join booking_assignments assignment on assignment.booking_id = booking.id
  where booking.quote_id = v_quote.id
  order by assignment.id
  limit 1;
  if found then
    if v_existing.worker_id = p_worker_id and v_existing.start_at = p_start_at
       and v_existing.end_at = p_end_at and v_existing.time_zone = p_time_zone then
      return query select v_existing.public_id::text, v_existing.status::text, false;
      return;
    end if;
    raise exception using errcode = '22023', message = 'Booking already exists with different details.';
  end if;

  if exists(
    select 1 from booking_assignments assignment
    join bookings booking on booking.id = assignment.booking_id
    where assignment.worker_id = p_worker_id
      and booking.status in ('ready_for_payment','scheduled','in_progress','quality_review','rework')
      and booking.start_at < p_end_at and booking.end_at > p_start_at
  ) then
    raise exception using errcode = '22023', message = 'Worker is already assigned in this time window.';
  end if;

  select lead.customer_id, request.lead_id
  into v_customer_id, v_lead_id
  from service_requests request
  join leads lead on lead.id = request.lead_id
  where request.id = v_quote.service_request_id;
  if v_customer_id is null then
    raise exception using errcode = '22023', message = 'Customer account must be verified and linked.';
  end if;

  insert into bookings(
    public_id, quote_id, customer_id, status, start_at, end_at, time_zone,
    created_at, updated_at
  ) values (
    p_booking_public_id, v_quote.id, v_customer_id, 'ready_for_payment',
    p_start_at, p_end_at, p_time_zone, v_now, v_now
  ) returning id into v_booking_id;
  insert into invoices(
    public_id, number, booking_id, currency, subtotal_cents, tax_cents,
    total_cents, issued_at, due_at, created_at, updated_at
  ) values (
    p_invoice_public_id, 'ECC-' || p_invoice_public_id, v_booking_id,
    v_quote.currency, v_quote.subtotal_cents, v_quote.tax_cents,
    v_quote.total_cents, v_now, p_start_at, v_now, v_now
  );
  insert into booking_assignments(booking_id, worker_id, status, created_at, updated_at)
  values (v_booking_id, p_worker_id, 'accepted', v_now, v_now);
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'booking', v_booking_id, 'prepared',
    jsonb_build_object('worker_id', p_worker_id), v_now, v_now);
  perform app.sync_lead(v_lead_id);
  return query select p_booking_public_id, 'ready_for_payment'::text, true;
end;
$$;

create or replace function app.staff_transition_booking(
  p_auth_user_id text,
  p_booking_id bigint,
  p_action text,
  p_quality_confirmed boolean,
  p_notes text
)
returns table(booking_id text, status text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_booking bookings%rowtype;
  v_target text;
  v_lead_id bigint;
  v_now timestamptz := now();
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'bookings.dispatch');
  if p_booking_id is null or p_booking_id < 1
     or p_action is null or p_action not in ('start','submit_quality','complete','rework','cancel')
     or length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Invalid booking transition.';
  end if;
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found.'; end if;
  v_target := case
    when v_booking.status = 'ready_for_payment' and p_action = 'cancel' then 'cancelled'
    when v_booking.status = 'scheduled' and p_action = 'start' then 'in_progress'
    when v_booking.status = 'scheduled' and p_action = 'cancel' then 'cancelled'
    when v_booking.status = 'in_progress' and p_action = 'submit_quality' then 'quality_review'
    when v_booking.status = 'quality_review' and p_action = 'complete' then 'completed'
    when v_booking.status = 'quality_review' and p_action = 'rework' then 'rework'
    when v_booking.status = 'rework' and p_action = 'submit_quality' then 'quality_review'
    else null
  end;
  if v_target is null then
    raise exception using errcode = '22023', message = 'Transition is not allowed.';
  end if;
  if v_target = 'completed' and p_quality_confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'Quality review must be confirmed.';
  end if;

  update bookings set status = v_target,
    completed_at = case when v_target = 'completed' then v_now else completed_at end,
    updated_at = v_now
  where id = v_booking.id;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'booking', v_booking.id, p_action,
    jsonb_build_object('from', v_booking.status, 'to', v_target, 'notes', nullif(p_notes, '')),
    v_now, v_now);
  select request.lead_id into v_lead_id
  from quotes quote join service_requests request on request.id = quote.service_request_id
  where quote.id = v_booking.quote_id;
  if v_lead_id is not null then perform app.sync_lead(v_lead_id); end if;
  if v_target = 'completed' then
    insert into review_requests(booking_id, status, created_at, updated_at)
    values (v_booking.id, 'queued', v_now, v_now)
    on conflict (booking_id) do nothing;
  end if;
  return query select v_booking.public_id::text, v_target;
end;
$$;

create or replace function app.claim_review_request(p_delay_hours integer)
returns table(
  review_request_id bigint, booking_id bigint, attempt_token uuid,
  recipient text, customer_name text, attempts smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_id bigint;
  v_token uuid := gen_random_uuid();
begin
  if p_delay_hours is null or p_delay_hours < 0 or p_delay_hours > 168 then
    raise exception using errcode = '22023', message = 'Invalid review delay.';
  end if;

  update review_requests review
  set status = case
      when first_attempt_at <= now() - interval '23 hours' then 'needs_reconciliation'
      else 'retrying'
    end,
    reason = case
      when first_attempt_at <= now() - interval '23 hours' then 'provider_idempotency_window_expired'
      else 'stale_sender_recovered'
    end,
    updated_at = now()
  where review.status = 'sending' and review.last_attempt_at <= now() - interval '5 minutes';

  update review_requests review
  set status = 'suppressed', reason = 'ineligible_or_no_consent', updated_at = now()
  where review.status in ('queued','retrying')
    and review.created_at <= now() - make_interval(hours => p_delay_hours)
    and not exists(
      select 1
      from bookings booking
      join quotes quote on quote.id = booking.quote_id
      join service_requests request on request.id = quote.service_request_id
      join leads lead on lead.id = request.lead_id
      where booking.id = review.booking_id and booking.status = 'completed'
        and lead.email is not null and length(lead.email) <= 255
        and lead.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        and coalesce((
          select consent.granted from consents consent
          where consent.lead_id = lead.id and consent.channel = 'review_email'
          order by consent.id desc limit 1
        ), false)
    );

  select review.id into v_id
  from review_requests review
  join bookings booking on booking.id = review.booking_id
  join quotes quote on quote.id = booking.quote_id
  join service_requests request on request.id = quote.service_request_id
  join leads lead on lead.id = request.lead_id
  where review.status in ('queued','retrying')
    and review.attempts < 3
    and review.created_at <= now() - make_interval(hours => p_delay_hours)
    and (review.first_attempt_at is null or review.first_attempt_at > now() - interval '23 hours')
    and booking.status = 'completed'
    and coalesce((
      select consent.granted from consents consent
      where consent.lead_id = lead.id and consent.channel = 'review_email'
      order by consent.id desc limit 1
    ), false)
  order by review.created_at, review.id
  for update of review skip locked
  limit 1;

  if v_id is null then return; end if;
  update review_requests review
  set status = 'sending', attempts = review.attempts + 1,
    attempt_token = v_token,
    first_attempt_at = coalesce(review.first_attempt_at, now()),
    last_attempt_at = now(), reason = null, updated_at = now()
  where review.id = v_id;

  return query
  select review.id, review.booking_id, review.attempt_token,
    lower(lead.email)::text, lead.name::text, review.attempts
  from review_requests review
  join bookings booking on booking.id = review.booking_id
  join quotes quote on quote.id = booking.quote_id
  join service_requests request on request.id = quote.service_request_id
  join leads lead on lead.id = request.lead_id
  where review.id = v_id and review.attempt_token = v_token;
end;
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
  with changed as (
    update review_requests
    set status = 'sent', provider_message_id = p_provider_message_id,
      sent_at = now(), reason = null, updated_at = now()
    where id = p_review_request_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_review_request_retry(
  p_review_request_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update review_requests
    set status = case when attempts >= 3 then 'needs_reconciliation' else 'retrying' end,
      reason = left(coalesce(p_reason, 'transient_or_ambiguous_provider_error'), 255),
      updated_at = now()
    where id = p_review_request_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.mark_review_request_failed(
  p_review_request_id bigint,
  p_attempt_token uuid,
  p_reason text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
  with changed as (
    update review_requests
    set status = 'failed', reason = left(coalesce(p_reason, 'permanent_provider_error'), 255),
      updated_at = now()
    where id = p_review_request_id and status = 'sending' and attempt_token = p_attempt_token
    returning id
  ) select exists(select 1 from changed)
$$;

create or replace function app.staff_prepare_test_invoice(
  p_auth_user_id text,
  p_booking_public_id text,
  p_mode text,
  p_days_until_due integer,
  p_idempotency_key text
)
returns table(
  payment_id bigint, payment_status text, stripe_invoice_id text,
  hosted_invoice_url text, amount_cents bigint, currency text,
  customer_email text, customer_name text, description text,
  days_until_due integer, booking_id text, quote_id text,
  request_receipt text, payment_mode text
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_booking record;
  v_payment payments%rowtype;
  v_settled bigint;
  v_amount bigint;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'payments.issue');
  if p_booking_public_id is null or p_booking_public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$'
     or p_mode is null or p_mode not in ('deposit','full','balance')
     or p_days_until_due is null or p_days_until_due < 1 or p_days_until_due > 90
     or p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 120
     or p_idempotency_key !~ '^[!-~]+$' then
    raise exception using errcode = '22023', message = 'Invalid test invoice request.';
  end if;

  select booking.id, booking.public_id as booking_public_id, booking.status as booking_status,
    quote.public_id as quote_public_id, quote.status as quote_status,
    quote.total_cents, quote.deposit_cents, quote.currency,
    request.public_id as request_public_id, lead.name, lead.email,
    service.name as service_name
  into v_booking
  from bookings booking
  join quotes quote on quote.id = booking.quote_id
  join service_requests request on request.id = quote.service_request_id
  join leads lead on lead.id = request.lead_id
  join service_types service on service.id = request.service_type_id
  where booking.public_id = p_booking_public_id
  for update of booking;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found.'; end if;
  if v_booking.quote_status <> 'accepted' then
    raise exception using errcode = '22023', message = 'The quote must be accepted before invoicing.';
  end if;
  if p_mode = 'balance' and v_booking.booking_status <> 'completed' then
    raise exception using errcode = '22023', message = 'Balance is available after service completion.';
  elsif p_mode <> 'balance' and v_booking.booking_status <> 'ready_for_payment' then
    raise exception using errcode = '22023', message = 'Booking is not ready for invoicing.';
  end if;
  if nullif(v_booking.email, '') is null then
    raise exception using errcode = '22023', message = 'A verified customer email is required before invoicing.';
  end if;

  select coalesce(sum(payment.amount_cents - payment.refunded_cents), 0)
  into v_settled
  from payments payment
  where payment.booking_id = v_booking.id and payment.environment = 'test'
    and payment.idempotency_key <> p_idempotency_key
    and payment.status in ('succeeded','partially_refunded');
  v_amount := case
    when p_mode = 'balance' then greatest(0, v_booking.total_cents - v_settled)
    when p_mode = 'deposit' then v_booking.deposit_cents
    else v_booking.total_cents
  end;
  if p_mode <> 'balance' and v_settled > 0 then
    raise exception using errcode = '22023', message = 'Payment already received for this booking.';
  end if;
  if v_amount < 50 or v_amount > 99999999 or v_booking.currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'No approved amount for this invoice mode.';
  end if;

  select * into v_payment from payments where idempotency_key = p_idempotency_key for update;
  if found then
    if v_payment.booking_id <> v_booking.id or v_payment.amount_cents <> v_amount
       or v_payment.kind <> p_mode or v_payment.environment <> 'test'
       or v_payment.stripe_intent_id is not null then
      raise exception using errcode = '23505', message = 'Idempotency key reused for a different payment.';
    end if;
    if v_payment.status = 'needs_reconciliation' then
      raise exception using errcode = '22023', message = 'The prior Stripe result is ambiguous and must be reconciled before retrying.';
    end if;
  else
    if exists(
      select 1 from payments payment
      where payment.booking_id = v_booking.id and payment.environment = 'test'
        and payment.idempotency_key <> p_idempotency_key
        and payment.status in (
          'creating','requires_payment_method','requires_confirmation','requires_action',
          'processing','invoice_open','failed','needs_reconciliation'
        )
    ) then
      raise exception using errcode = '22023', message = 'Another test payment option is already in progress.';
    end if;
    insert into payments(
      booking_id, kind, status, currency, amount_cents, refunded_cents,
      idempotency_key, environment, created_at, updated_at
    ) values (
      v_booking.id, p_mode, 'creating', v_booking.currency, v_amount, 0,
      p_idempotency_key, 'test', now(), now()
    ) returning * into v_payment;
    insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
    values (v_actor_id, 'payment', v_payment.id, 'test_invoice.prepared',
      jsonb_build_object('mode', p_mode, 'amount_cents', v_amount, 'days_until_due', p_days_until_due),
      now(), now());
  end if;

  return query select
    v_payment.id, v_payment.status::text, v_payment.stripe_invoice_id::text,
    v_payment.hosted_invoice_url, v_amount, v_booking.currency::text,
    v_booking.email::text, v_booking.name::text,
    (v_booking.service_name || ' - approved ' || p_mode)::text,
    p_days_until_due, v_booking.booking_public_id::text,
    v_booking.quote_public_id::text, v_booking.request_public_id::text, p_mode;
end;
$$;

create or replace function app.staff_record_test_invoice(
  p_auth_user_id text,
  p_payment_id bigint,
  p_customer_id text,
  p_invoice_id text,
  p_hosted_invoice_url text,
  p_invoice_pdf_url text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_payment payments%rowtype;
  v_first_record boolean;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'payments.issue');
  if p_customer_id !~ '^cus_' or p_invoice_id !~ '^in_'
     or p_hosted_invoice_url is null or p_hosted_invoice_url !~ '^https://'
     or (p_invoice_pdf_url is not null and p_invoice_pdf_url !~ '^https://') then
    raise exception using errcode = '22023', message = 'Stripe test invoice response is invalid.';
  end if;
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.environment <> 'test' or v_payment.stripe_intent_id is not null then
    raise exception using errcode = 'P0002', message = 'Test payment not found.';
  end if;
  if (v_payment.stripe_invoice_id is not null and v_payment.stripe_invoice_id <> p_invoice_id)
     or (v_payment.stripe_customer_id is not null and v_payment.stripe_customer_id <> p_customer_id) then
    raise exception using errcode = '22023', message = 'Stripe test invoice does not match the saved payment.';
  end if;
  v_first_record := v_payment.stripe_invoice_id is null;
  update payments set
    stripe_customer_id = p_customer_id, stripe_invoice_id = p_invoice_id,
    hosted_invoice_url = p_hosted_invoice_url, invoice_pdf_url = p_invoice_pdf_url,
    status = case when status = 'creating' then 'invoice_open' else status end,
    failure_code = case when status = 'creating' then null else failure_code end,
    failure_message = case when status = 'creating' then null else failure_message end,
    updated_at = now()
  where id = p_payment_id;
  if v_first_record then
    insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
    values (v_actor_id, 'payment', p_payment_id, 'test_invoice.issued',
      jsonb_build_object('stripe_invoice_id', p_invoice_id), now(), now());
  end if;
end;
$$;

create or replace function app.staff_hold_test_invoice_for_reconciliation(
  p_auth_user_id text,
  p_payment_id bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'payments.issue');
  update payments set status = 'needs_reconciliation',
    failure_code = 'stripe_invoice_result_unknown',
    failure_message = 'Stripe did not return a confirmed invoice result. Reconcile before retrying.',
    failed_at = now(), updated_at = now()
  where id = p_payment_id and environment = 'test' and status = 'creating';
  if not found then return; end if;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (v_actor_id, 'payment', p_payment_id, 'test_invoice.needs_reconciliation', null, now(), now());
end;
$$;

commit;
