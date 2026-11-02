begin;

-- This function is called only after the edge worker verifies Stripe's raw-body
-- signature.  It owns duplicate-event handling and all payment state changes so
-- a webhook is one database transaction.  Quote submission never calls it.
create or replace function app.process_stripe_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_object jsonb
)
returns table(disposition text, payment_id bigint, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, app, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_environment text := case when p_livemode then 'live' else 'test' end;
  v_provider_event_id bigint;
  v_object_id text;
  v_metadata_payment_id bigint;
  v_reported_amount bigint;
  v_reported_currency text;
  v_payment payments%rowtype;
  v_refunded bigint;
  v_booking_advanced integer := 0;
begin
  if p_event_id is null or length(p_event_id) < 3 or length(p_event_id) > 255
     or p_event_type is null or length(p_event_type) < 3 or length(p_event_type) > 255
     or jsonb_typeof(p_object) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid Stripe event envelope.';
  end if;

  insert into provider_events(provider, event_id, event_type, created_at, updated_at)
  values ('stripe', p_event_id, p_event_type, v_now, v_now)
  on conflict (provider, event_id) do nothing
  returning id into v_provider_event_id;

  if v_provider_event_id is null then
    return query select 'duplicate'::text, null::bigint, null::text;
    return;
  end if;

  v_object_id := nullif(p_object->>'id', '');
  if coalesce(p_object#>>'{metadata,payment_id}', '') ~ '^[0-9]+$' then
    v_metadata_payment_id := (p_object#>>'{metadata,payment_id}')::bigint;
  end if;
  if coalesce(p_object->>'currency', '') ~ '^[A-Za-z]{3}$' then
    v_reported_currency := upper(p_object->>'currency');
  end if;

  if p_event_type in ('payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled')
     and v_object_id is not null then
    select payment.* into v_payment
    from payments payment
    where payment.environment = v_environment
      and (
        payment.stripe_intent_id = v_object_id
        or (payment.stripe_intent_id is null and v_metadata_payment_id is not null and payment.id = v_metadata_payment_id)
      )
    order by (payment.stripe_intent_id = v_object_id) desc nulls last
    for update
    limit 1;

    if not found then
      update provider_events set processed_at = v_now, updated_at = v_now
      where id = v_provider_event_id;
      return query select 'unmatched'::text, null::bigint, null::text;
      return;
    end if;

    if p_event_type = 'payment_intent.succeeded' then
      if coalesce(p_object->>'amount_received', '') ~ '^[0-9]+$' then
        v_reported_amount := (p_object->>'amount_received')::bigint;
      elsif coalesce(p_object->>'amount', '') ~ '^[0-9]+$' then
        v_reported_amount := (p_object->>'amount')::bigint;
      end if;
    elsif coalesce(p_object->>'amount', '') ~ '^[0-9]+$' then
      v_reported_amount := (p_object->>'amount')::bigint;
    end if;

    if (v_payment.stripe_intent_id is not null and v_payment.stripe_intent_id <> v_object_id)
       or v_reported_amount is distinct from v_payment.amount_cents
       or v_reported_currency is distinct from upper(v_payment.currency) then
      update provider_events
      set event_type = p_event_type || '.mismatch', processed_at = v_now, updated_at = v_now
      where id = v_provider_event_id;
      return query select 'mismatch'::text, v_payment.id, v_payment.status::text;
      return;
    end if;

    if v_payment.stripe_intent_id is null then
      update payments set stripe_intent_id = v_object_id, updated_at = v_now
      where id = v_payment.id;
    end if;

    if p_event_type = 'payment_intent.succeeded'
       and v_payment.status not in ('succeeded','partially_refunded','refunded') then
      update payments
      set status = 'succeeded', paid_at = v_now, failed_at = null,
          failure_code = null, failure_message = null, updated_at = v_now
      where id = v_payment.id;

      -- Test-mode events never advance a real booking.  Live advancement remains
      -- additionally gated by the worker's explicit live-payments switch.
      if p_livemode then
        update bookings set status = 'scheduled', updated_at = v_now
        where id = v_payment.booking_id and status = 'ready_for_payment';
        get diagnostics v_booking_advanced = row_count;
        if v_booking_advanced > 0 then
          update leads lead
          set pipeline_stage = 'booked', updated_at = v_now
          from bookings booking
          join quotes quote on quote.id = booking.quote_id
          join service_requests request on request.id = quote.service_request_id
          where booking.id = v_payment.booking_id and lead.id = request.lead_id;
        end if;
      end if;
    elsif p_event_type <> 'payment_intent.succeeded'
          and v_payment.status not in ('succeeded','partially_refunded','refunded') then
      update payments
      set status = case when p_event_type = 'payment_intent.canceled' then 'canceled' else 'failed' end,
          failed_at = case when p_event_type = 'payment_intent.payment_failed' then v_now else failed_at end,
          failure_code = p_event_type,
          failure_message = case when p_event_type = 'payment_intent.payment_failed'
            then 'Stripe reported that the payment failed.' else null end,
          updated_at = v_now
      where id = v_payment.id;
    end if;

  elsif p_event_type = 'charge.refunded'
        and nullif(p_object->>'payment_intent', '') is not null then
    select payment.* into v_payment
    from payments payment
    where payment.environment = v_environment
      and payment.stripe_intent_id = p_object->>'payment_intent'
    for update
    limit 1;

    if found and coalesce(p_object->>'amount_refunded', '') ~ '^[0-9]+$' then
      v_refunded := least(v_payment.amount_cents, (p_object->>'amount_refunded')::bigint);
      update payments
      set refunded_cents = v_refunded,
          status = case when v_refunded >= amount_cents then 'refunded' else 'partially_refunded' end,
          updated_at = v_now
      where id = v_payment.id;
    end if;

  elsif p_event_type in ('invoice.paid','invoice.payment_failed','invoice.voided','invoice.marked_uncollectible')
        and v_object_id is not null then
    select payment.* into v_payment
    from payments payment
    where payment.environment = v_environment
      and (
        payment.stripe_invoice_id = v_object_id
        or (payment.stripe_invoice_id is null and v_metadata_payment_id is not null and payment.id = v_metadata_payment_id)
      )
    order by (payment.stripe_invoice_id = v_object_id) desc nulls last
    for update
    limit 1;

    if not found then
      update provider_events set processed_at = v_now, updated_at = v_now
      where id = v_provider_event_id;
      return query select 'unmatched'::text, null::bigint, null::text;
      return;
    end if;

    if coalesce(p_object->>'total', '') ~ '^[0-9]+$' then
      v_reported_amount := (p_object->>'total')::bigint;
    elsif coalesce(p_object->>'amount_due', '') ~ '^[0-9]+$' then
      v_reported_amount := (p_object->>'amount_due')::bigint;
    end if;

    if (v_payment.stripe_invoice_id is not null and v_payment.stripe_invoice_id <> v_object_id)
       or v_reported_amount is distinct from v_payment.amount_cents
       or v_reported_currency is distinct from upper(v_payment.currency) then
      update provider_events
      set event_type = p_event_type || '.mismatch', processed_at = v_now, updated_at = v_now
      where id = v_provider_event_id;
      return query select 'mismatch'::text, v_payment.id, v_payment.status::text;
      return;
    end if;

    if v_payment.stripe_invoice_id is null then
      update payments set stripe_invoice_id = v_object_id, updated_at = v_now
      where id = v_payment.id;
    end if;

    if p_event_type = 'invoice.paid'
       and v_payment.status not in ('succeeded','partially_refunded','refunded') then
      update payments
      set status = 'succeeded', paid_at = v_now, failed_at = null,
          failure_code = null, failure_message = null, updated_at = v_now
      where id = v_payment.id;
    elsif p_event_type <> 'invoice.paid'
          and v_payment.status not in ('succeeded','partially_refunded','refunded') then
      update payments
      set status = case p_event_type
          when 'invoice.payment_failed' then 'failed'
          when 'invoice.voided' then 'canceled'
          else 'uncollectible' end,
          failed_at = case when p_event_type = 'invoice.payment_failed' then v_now else failed_at end,
          failure_code = p_event_type,
          failure_message = case when p_event_type = 'invoice.payment_failed'
            then 'Stripe reported that the invoice payment failed.' else null end,
          updated_at = v_now
      where id = v_payment.id;
    end if;
  end if;

  update provider_events set processed_at = v_now, updated_at = v_now
  where id = v_provider_event_id;

  if v_payment.id is null then
    return query select 'ignored'::text, null::bigint, null::text;
  else
    return query
      select 'processed'::text, payment.id, payment.status::text
      from payments payment where payment.id = v_payment.id;
  end if;
end;
$$;

commit;
