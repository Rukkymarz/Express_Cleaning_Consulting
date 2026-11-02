-- Advance every identity sequence after explicit legacy IDs have been imported.
-- Safe to re-run.

DO $$
DECLARE
    table_name text;
    sequence_name text;
    maximum_id bigint;
BEGIN
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

        IF maximum_id IS NULL THEN
            PERFORM setval(sequence_name::regclass, 1, false);
        ELSE
            PERFORM setval(sequence_name::regclass, maximum_id, true);
        END IF;
    END LOOP;
END
$$;
