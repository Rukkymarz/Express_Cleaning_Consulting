begin;

-- Keep payment issuance separate from quote preparation, and give a lead
-- manager an explicit, reviewable export capability without billing, secrets,
-- user administration, deletion, quote issuance, booking dispatch, or worker
-- approval permissions.
insert into permissions(name, guard_name, created_at, updated_at)
values
  ('leads.export', 'web', now(), now()),
  ('payments.issue', 'web', now(), now())
on conflict (name, guard_name) do nothing;

insert into roles(name, guard_name, created_at, updated_at)
values ('lead_manager', 'web', now(), now())
on conflict (name, guard_name) do nothing;

-- This role is deliberately exact. Re-running the migration also removes any
-- accidentally broadened grant from this application-managed role.
delete from role_has_permissions role_permission
using roles role, permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.name = 'lead_manager' and role.guard_name = 'web'
  and permission.name not in ('leads.view','leads.edit','leads.export','calls.place');

insert into role_has_permissions(role_id, permission_id)
select role.id, permission.id
from roles role
cross join permissions permission
where role.name = 'lead_manager' and role.guard_name = 'web'
  and permission.guard_name = 'web'
  and permission.name in ('leads.view','leads.edit','leads.export','calls.place')
on conflict (permission_id, role_id) do nothing;

insert into role_has_permissions(role_id, permission_id)
select role.id, permission.id
from roles role
cross join permissions permission
where role.name = 'owner' and role.guard_name = 'web'
  and permission.guard_name = 'web'
  and permission.name in ('leads.export','payments.issue')
on conflict (permission_id, role_id) do nothing;

-- The original preview source used quotes.issue for test-invoice operations.
-- Replace that single authorization check in each already-deployed function;
-- the canonical 005 source now uses payments.issue directly for new databases.
do $$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'app.staff_prepare_test_invoice(text,text,text,integer,text)',
    'app.staff_record_test_invoice(text,bigint,text,text,text,text)',
    'app.staff_hold_test_invoice_for_reconciliation(text,bigint)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if position('''payments.issue''' in v_definition) > 0 then
      continue;
    end if;
    if position('''quotes.issue''' in v_definition) = 0 then
      raise exception 'Expected quote permission check was not found in %', v_signature;
    end if;
    execute replace(v_definition, '''quotes.issue''', '''payments.issue''');
  end loop;
end;
$$;

create or replace function app.staff_export_leads(p_auth_user_id text)
returns table(
  receipt text,
  name text,
  email text,
  phone text,
  lead_status text,
  pipeline_stage text,
  lead_score smallint,
  assigned_agent text,
  next_follow_up_at timestamptz,
  service_name text,
  street text,
  unit text,
  city text,
  region text,
  postal_code text,
  task_status text,
  notification_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_actor_id bigint;
  v_row_count bigint;
begin
  v_actor_id := app.require_permission(p_auth_user_id, 'leads.export');
  select count(*) into v_row_count from leads;
  insert into audit_events(actor_id, entity_type, entity_id, action, changes, created_at, updated_at)
  values (
    v_actor_id, 'lead_export', 0, 'csv.exported',
    jsonb_build_object('available_rows', v_row_count, 'maximum_rows', 50000),
    now(), now()
  );

  return query
  select
    request.public_id::text,
    lead.name::text,
    lead.email::text,
    lead.phone::text,
    lead.status::text,
    lead.pipeline_stage::text,
    lead.lead_score,
    agent.name::text,
    lead.next_follow_up_at,
    service.name::text,
    address.street::text,
    address.unit::text,
    address.city::text,
    address.region::text,
    address.postal_code::text,
    task.status::text,
    notification.status::text,
    lead.created_at
  from leads lead
  left join users agent on agent.id = lead.assigned_agent_id
  left join lateral (
    select latest.* from service_requests latest
    where latest.lead_id = lead.id order by latest.id desc limit 1
  ) request on true
  left join service_types service on service.id = request.service_type_id
  left join addresses address on address.id = request.address_id
  left join staff_tasks task on task.service_request_id = request.id and task.kind = 'quote_review'
  left join quote_request_notifications notification on notification.service_request_id = request.id
  order by lead.created_at desc nulls last, lead.id desc
  limit 50000;
end;
$$;

revoke execute on function app.staff_export_leads(text) from public;
grant execute on function app.staff_export_leads(text) to ecc_edge_runtime;

commit;
