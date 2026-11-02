begin;

-- Create the LOGIN role named ecc_edge_runtime in Neon's secure role UI first,
-- with a generated password that is stored only as a Cloudflare Worker secret.
-- This migration intentionally contains no credential.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ecc_edge_runtime' and rolcanlogin) then
    raise exception 'Create the LOGIN role ecc_edge_runtime securely in Neon before applying 006_runtime_security.sql';
  end if;
end;
$$;

revoke create on schema public from public;
revoke all on schema app from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke execute on all functions in schema app from public;
alter default privileges in schema app revoke execute on functions from public;

grant usage on schema public, app to ecc_edge_runtime;

grant execute on function app.public_catalog_services() to ecc_edge_runtime;
grant execute on function app.public_catalog_markets() to ecc_edge_runtime;
grant execute on function app.create_callback_request(
  text,text,text,text,text,text,text,text,text,text,text,text,text
) to ecc_edge_runtime;
grant execute on function app.request_workflow_status(text) to ecc_edge_runtime;
grant execute on function app.claim_quote_notification() to ecc_edge_runtime;
grant execute on function app.mark_quote_notification_sent(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_quote_notification_retry(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_quote_notification_failed(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.create_public_intake(
  text,text,text,text,text,text,jsonb,boolean,text,text,text
) to ecc_edge_runtime;
grant execute on function app.claim_launch_mail() to ecc_edge_runtime;
grant execute on function app.mark_launch_mail_sent(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_launch_mail_retry(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_launch_mail_failed(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.consume_api_rate_limit(text,integer,integer) to ecc_edge_runtime;
grant execute on function app.prune_api_rate_limits() to ecc_edge_runtime;
grant execute on function app.process_stripe_event(text,text,boolean,jsonb) to ecc_edge_runtime;
grant execute on function app.account_context(text) to ecc_edge_runtime;
grant execute on function app.staff_context(text) to ecc_edge_runtime;
grant execute on function app.staff_agents(text) to ecc_edge_runtime;
grant execute on function app.staff_list_leads(text,text,bigint,boolean,text,smallint,bigint,integer) to ecc_edge_runtime;
grant execute on function app.staff_update_lead(text,bigint,text,timestamptz,boolean) to ecc_edge_runtime;
grant execute on function app.staff_assign_lead(text,bigint,bigint) to ecc_edge_runtime;
grant execute on function app.staff_update_task(text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_list_inquiries(text,text,integer,integer) to ecc_edge_runtime;
grant execute on function app.staff_update_inquiry(text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_list_prospects(text,text,text,timestamptz,text,text,integer,bigint,integer) to ecc_edge_runtime;
grant execute on function app.staff_create_prospect(text,text,text,text,text,text,text,text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_update_prospect(text,bigint,text,text,boolean,timestamptz,boolean,bigint,boolean) to ecc_edge_runtime;
grant execute on function app.staff_convert_prospect(text,bigint,text) to ecc_edge_runtime;
grant execute on function app.staff_approved_workers(text) to ecc_edge_runtime;
grant execute on function app.staff_create_service_plan(text,bigint,text,date,boolean) to ecc_edge_runtime;
grant execute on function app.staff_resolve_plan_change(text,bigint,text,date) to ecc_edge_runtime;
grant execute on function app.account_list_bookings(text,bigint,integer) to ecc_edge_runtime;
grant execute on function app.account_get_booking(text,text) to ecc_edge_runtime;
grant execute on function app.account_list_payments(text,text) to ecc_edge_runtime;
grant execute on function app.account_get_invoice(text,text) to ecc_edge_runtime;
grant execute on function app.account_list_invoice_items(text,text) to ecc_edge_runtime;
grant execute on function app.account_list_plans(text) to ecc_edge_runtime;
grant execute on function app.account_list_pending_plan_changes(text) to ecc_edge_runtime;
grant execute on function app.account_request_plan_change(text,text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_issue_quote(text,bigint,text,text,jsonb,bigint,bigint,timestamptz) to ecc_edge_runtime;
grant execute on function app.customer_accept_quote(text,text) to ecc_edge_runtime;
grant execute on function app.staff_prepare_booking(text,text,bigint,timestamptz,timestamptz,text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_transition_booking(text,bigint,text,boolean,text) to ecc_edge_runtime;
grant execute on function app.claim_review_request(integer) to ecc_edge_runtime;
grant execute on function app.mark_review_request_sent(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_review_request_retry(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.mark_review_request_failed(bigint,uuid,text) to ecc_edge_runtime;
grant execute on function app.staff_prepare_test_invoice(text,text,text,integer,text) to ecc_edge_runtime;
grant execute on function app.staff_record_test_invoice(text,bigint,text,text,text,text) to ecc_edge_runtime;
grant execute on function app.staff_hold_test_invoice_for_reconciliation(text,bigint) to ecc_edge_runtime;

commit;
