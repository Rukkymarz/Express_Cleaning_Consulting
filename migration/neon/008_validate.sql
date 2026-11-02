-- Run after import, reference seeding, workflow installation, and sequence reset.
-- Any structural or relationship failure aborts with an exception.

DO $$
DECLARE
    table_name text;
    missing_tables text[] := ARRAY[]::text[];
    invalid_count bigint;
    sequence_name text;
    sequence_last bigint;
    sequence_called boolean;
    maximum_id bigint;
    function_signature text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'migrations',
        'users',
        'password_reset_tokens',
        'sessions',
        'cache',
        'cache_locks',
        'api_rate_limits',
        'jobs',
        'failed_jobs',
        'job_batches',
        'personal_access_tokens',
        'markets',
        'service_types',
        'addresses',
        'leads',
        'consents',
        'service_requests',
        'request_add_ons',
        'pricing_rules',
        'quotes',
        'quote_items',
        'bookings',
        'workers',
        'booking_assignments',
        'payments',
        'calls',
        'campaigns',
        'campaign_deliveries',
        'provider_events',
        'audit_events',
        'media',
        'permissions',
        'roles',
        'model_has_permissions',
        'model_has_roles',
        'role_has_permissions',
        'invoices',
        'service_plans',
        'plan_change_requests',
        'agent_presence',
        'review_requests',
        'staff_tasks',
        'quote_request_notifications',
        'sales_prospects',
        'prospect_reminders',
        'public_intakes',
        'launch_mail_outbox'
    ]
    LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN
            missing_tables := array_append(missing_tables, table_name);
        END IF;
    END LOOP;

    IF cardinality(missing_tables) > 0 THEN
        RAISE EXCEPTION 'Missing expected tables: %', array_to_string(missing_tables, ', ');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecc_edge_runtime' AND rolcanlogin) THEN
        RAISE EXCEPTION 'Least-privilege LOGIN role ecc_edge_runtime is missing';
    END IF;

    SELECT count(*) INTO invalid_count
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) access
    WHERE namespace.nspname = 'app' AND access.grantee = 0 AND access.privilege_type = 'EXECUTE';

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% app functions remain executable by PUBLIC', invalid_count;
    END IF;

    FOREACH function_signature IN ARRAY ARRAY[
        'app.public_catalog_services()',
        'app.public_catalog_markets()',
        'app.create_callback_request(text,text,text,text,text,text,text,text,text,text,text,text,text)',
        'app.create_public_intake(text,text,text,text,text,text,jsonb,boolean,text,text,text)',
        'app.request_workflow_status(text)',
        'app.claim_quote_notification()',
        'app.claim_launch_mail()',
        'app.consume_api_rate_limit(text,integer,integer)',
        'app.process_stripe_event(text,text,boolean,jsonb)',
        'app.account_context(text)',
        'app.staff_context(text)',
        'app.staff_list_leads(text,text,bigint,boolean,text,smallint,bigint,integer)',
        'app.staff_link_customer(text,bigint,text)',
        'app.staff_update_task(text,text,text)',
        'app.staff_list_prospects(text,text,text,timestamptz,text,text,integer,bigint,integer)',
        'app.staff_convert_prospect(text,bigint,text)',
        'app.staff_approved_workers(text)',
        'app.staff_create_service_plan(text,bigint,text,date,boolean)',
        'app.staff_resolve_plan_change(text,bigint,text,date)',
        'app.account_list_bookings(text,bigint,integer)',
        'app.account_list_quotes(text)',
        'app.account_get_booking(text,text)',
        'app.account_list_payments(text,text)',
        'app.account_get_invoice(text,text)',
        'app.account_list_invoice_items(text,text)',
        'app.account_list_plans(text)',
        'app.account_list_pending_plan_changes(text)',
        'app.account_request_plan_change(text,text,text,text)',
        'app.staff_issue_quote(text,bigint,text,text,jsonb,bigint,bigint,timestamptz)',
        'app.customer_accept_quote(text,text)',
        'app.staff_prepare_booking(text,text,bigint,timestamptz,timestamptz,text,text,text)',
        'app.staff_transition_booking(text,bigint,text,boolean,text)',
        'app.claim_review_request(integer)',
        'app.mark_review_request_sent(bigint,uuid,text)',
        'app.mark_review_request_retry(bigint,uuid,text)',
        'app.mark_review_request_failed(bigint,uuid,text)',
        'app.staff_prepare_test_invoice(text,text,text,integer,text)'
    ]
    LOOP
        IF to_regprocedure(function_signature) IS NULL THEN
            RAISE EXCEPTION 'Expected function is missing: %', function_signature;
        END IF;
        IF NOT has_function_privilege('ecc_edge_runtime', function_signature, 'EXECUTE') THEN
            RAISE EXCEPTION 'ecc_edge_runtime cannot execute %', function_signature;
        END IF;
    END LOOP;

    SELECT count(*)
      INTO invalid_count
      FROM pg_constraint
     WHERE contype = 'f'
       AND connamespace = 'public'::regnamespace
       AND NOT convalidated;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% foreign-key constraints are not validated', invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM quote_request_notifications AS notification
      JOIN staff_tasks AS task ON task.id = notification.staff_task_id
     WHERE notification.service_request_id <> task.service_request_id;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION
            '% quote notifications point to a task for a different request',
            invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM quote_request_notifications
     WHERE (attempts = 0 AND first_attempt_at IS NOT NULL)
        OR (attempts > 0 AND first_attempt_at IS NULL)
        OR (last_attempt_at IS NOT NULL AND first_attempt_at > last_attempt_at);

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% quote notification attempt timelines are invalid', invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM launch_mail_outbox
     WHERE (attempts = 0 AND first_attempt_at IS NOT NULL)
        OR (attempts > 0 AND first_attempt_at IS NULL)
        OR (last_attempt_at IS NOT NULL AND first_attempt_at > last_attempt_at);

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% launch mail attempt timelines are invalid', invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM review_requests
     WHERE (attempts = 0 AND first_attempt_at IS NOT NULL)
        OR (attempts > 0 AND first_attempt_at IS NULL)
        OR (last_attempt_at IS NOT NULL AND first_attempt_at > last_attempt_at);

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% review request attempt timelines are invalid', invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM (
          SELECT lower(email)
            FROM users
           GROUP BY lower(email)
          HAVING count(*) > 1
      ) AS duplicate_emails;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% case-insensitive duplicate user emails found', invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM (
          SELECT lower(email)
            FROM sales_prospects
           WHERE email IS NOT NULL
           GROUP BY lower(email)
          HAVING count(*) > 1
      ) AS duplicate_emails;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION
            '% case-insensitive duplicate prospect emails found',
            invalid_count;
    END IF;

    SELECT count(*)
      INTO invalid_count
      FROM (
          SELECT public_id FROM leads
          UNION ALL SELECT public_id FROM service_requests
          UNION ALL SELECT public_id FROM quotes
          UNION ALL SELECT public_id FROM bookings
          UNION ALL SELECT public_id FROM invoices
          UNION ALL SELECT public_id FROM service_plans
          UNION ALL SELECT public_id FROM staff_tasks
          UNION ALL SELECT public_id FROM public_intakes
      ) AS public_ids
     WHERE public_id !~ '^[0-9A-HJKMNP-TV-Z]{26}$';

    IF invalid_count > 0 THEN
        RAISE EXCEPTION '% non-ULID public IDs found', invalid_count;
    END IF;

    FOREACH table_name IN ARRAY ARRAY[
        'migrations',
        'users',
        'jobs',
        'failed_jobs',
        'personal_access_tokens',
        'markets',
        'service_types',
        'addresses',
        'leads',
        'consents',
        'service_requests',
        'pricing_rules',
        'quotes',
        'quote_items',
        'bookings',
        'workers',
        'booking_assignments',
        'payments',
        'calls',
        'campaigns',
        'campaign_deliveries',
        'provider_events',
        'audit_events',
        'media',
        'permissions',
        'roles',
        'invoices',
        'service_plans',
        'plan_change_requests',
        'review_requests',
        'staff_tasks',
        'quote_request_notifications',
        'sales_prospects',
        'prospect_reminders',
        'public_intakes',
        'launch_mail_outbox'
    ]
    LOOP
        sequence_name := pg_get_serial_sequence(
            format('public.%I', table_name),
            'id'
        );

        IF sequence_name IS NULL THEN
            RAISE EXCEPTION 'No identity sequence found for %.id', table_name;
        END IF;

        EXECUTE format(
            'SELECT max(id)::bigint FROM public.%I',
            table_name
        ) INTO maximum_id;

        EXECUTE format(
            'SELECT last_value::bigint, is_called FROM %s',
            sequence_name
        ) INTO sequence_last, sequence_called;

        IF maximum_id IS NOT NULL
           AND (sequence_last < maximum_id OR NOT sequence_called) THEN
            RAISE EXCEPTION
                'Identity sequence for %.id is behind imported data (sequence %, max %)',
                table_name,
                sequence_last,
                maximum_id;
        END IF;
    END LOOP;
END
$$;

SELECT entity, row_count
FROM (
    SELECT 1 AS display_order, 'users' AS entity, count(*) AS row_count FROM users
    UNION ALL SELECT 2, 'leads', count(*) FROM leads
    UNION ALL SELECT 3, 'service_requests', count(*) FROM service_requests
    UNION ALL SELECT 4, 'staff_tasks', count(*) FROM staff_tasks
    UNION ALL SELECT 5, 'quote_request_notifications', count(*)
      FROM quote_request_notifications
    UNION ALL SELECT 6, 'quotes', count(*) FROM quotes
    UNION ALL SELECT 7, 'bookings', count(*) FROM bookings
    UNION ALL SELECT 8, 'payments', count(*) FROM payments
    UNION ALL SELECT 9, 'provider_events', count(*) FROM provider_events
    UNION ALL SELECT 10, 'audit_events', count(*) FROM audit_events
    UNION ALL SELECT 11, 'public_intakes', count(*) FROM public_intakes
) AS counts
ORDER BY display_order;

SELECT
    status,
    count(*) AS notification_count,
    min(created_at) AS oldest,
    max(created_at) AS newest
FROM quote_request_notifications
GROUP BY status
ORDER BY status;

SELECT
    provider,
    event_type,
    count(*) AS event_count,
    count(*) FILTER (WHERE processed_at IS NULL) AS unprocessed_count
FROM provider_events
GROUP BY provider, event_type
ORDER BY provider, event_type;
