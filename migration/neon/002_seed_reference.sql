-- Reference data from DatabaseSeeder plus the exterior/removal service migration.
-- Run after the production data import so existing IDs and customer references win.

BEGIN;

INSERT INTO permissions (name, guard_name, created_at, updated_at)
SELECT permission_name, 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    VALUES
        ('leads.view'),
        ('leads.edit'),
        ('leads.export'),
        ('quotes.issue'),
        ('payments.issue'),
        ('bookings.dispatch'),
        ('calls.place'),
        ('campaigns.manage'),
        ('workers.approve')
) AS seed(permission_name)
ON CONFLICT (name, guard_name) DO NOTHING;

INSERT INTO roles (name, guard_name, created_at, updated_at)
SELECT role_name, 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    VALUES
        ('owner'),
        ('lead_manager'),
        ('sales_agent'),
        ('dispatcher'),
        ('marketing_agent'),
        ('worker'),
        ('customer')
) AS seed(role_name)
ON CONFLICT (name, guard_name) DO NOTHING;

INSERT INTO role_has_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM (
    VALUES
        ('owner', 'leads.view'),
        ('owner', 'leads.edit'),
        ('owner', 'leads.export'),
        ('owner', 'quotes.issue'),
        ('owner', 'payments.issue'),
        ('owner', 'bookings.dispatch'),
        ('owner', 'calls.place'),
        ('owner', 'campaigns.manage'),
        ('owner', 'workers.approve'),
        ('lead_manager', 'leads.view'),
        ('lead_manager', 'leads.edit'),
        ('lead_manager', 'leads.export'),
        ('lead_manager', 'calls.place'),
        ('sales_agent', 'leads.view'),
        ('sales_agent', 'leads.edit'),
        ('sales_agent', 'quotes.issue'),
        ('sales_agent', 'calls.place'),
        ('dispatcher', 'leads.view'),
        ('dispatcher', 'bookings.dispatch'),
        ('marketing_agent', 'leads.view'),
        ('marketing_agent', 'campaigns.manage')
) AS grants(role_name, permission_name)
JOIN roles
  ON roles.name = grants.role_name
 AND roles.guard_name = 'web'
JOIN permissions
  ON permissions.name = grants.permission_name
 AND permissions.guard_name = 'web'
ON CONFLICT (permission_id, role_id) DO NOTHING;

INSERT INTO service_types (
    code, slug, name, category, description,
    request_enabled, instant_eligible, published,
    created_at, updated_at
)
SELECT
    seed.code,
    seed.slug,
    seed.name,
    seed.category,
    NULL,
    true,
    false,
    seed.category <> 'Add-on',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        ('RES-STD', 'standard-home-cleaning', 'Standard Residential Cleaning', 'Residential'),
        ('RES-DEEP', 'deep-cleaning', 'Deep Cleaning', 'Residential'),
        ('MOVE-IN', 'move-in-cleaning', 'Move-In Cleaning', 'Residential'),
        ('MOVE-OUT', 'move-out-cleaning', 'Move-Out Cleaning', 'Residential'),
        ('APT-TURN', 'apartment-turnover', 'Apartment Turnover / Make-Ready', 'Property Management'),
        ('AIRBNB', 'airbnb-turnover', 'Airbnb / STR Turnover', 'Property Management'),
        ('COMM-OFF', 'office-cleaning', 'Office Cleaning', 'Commercial'),
        ('JANITORIAL', 'janitorial', 'Recurring Janitorial Service', 'Commercial'),
        ('MED-OFF', 'medical-office-cleaning', 'Medical / Professional Office Cleaning', 'Commercial'),
        ('RETAIL', 'retail-cleaning', 'Retail / Storefront Cleaning', 'Commercial'),
        ('POST-CON', 'post-construction-cleaning', 'Post-Construction Cleaning', 'Specialty'),
        ('COMMON', 'common-area-cleaning', 'Common Area Cleaning', 'Property Management'),
        ('EVENT', 'event-cleaning', 'Event Cleaning', 'Specialty'),
        ('FLOOR', 'floor-care', 'Floor Care', 'Specialty'),
        ('WINDOW-INT', 'interior-glass-cleaning', 'Interior Window / Glass Cleaning', 'Specialty'),
        ('AUTO', 'vehicle-cleaning', 'Vehicle Cleaning', 'Specialty'),
        ('FRIDGE', 'inside-refrigerator', 'Inside Refrigerator', 'Add-on'),
        ('OVEN', 'inside-oven', 'Inside Oven', 'Add-on'),
        ('CABINETS', 'inside-cabinets', 'Inside Cabinets', 'Add-on'),
        ('LAUNDRY', 'laundry-linen', 'Laundry / Linen', 'Add-on'),
        ('ORGANIZE', 'light-organization', 'Light Organization', 'Add-on'),
        ('JUNK', 'junk-removal', 'Junk Removal', 'Specialty'),
        ('PRESSURE', 'pressure-washing', 'Pressure Washing', 'Specialty')
) AS seed(code, slug, name, category)
ON CONFLICT (code) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    request_enabled = EXCLUDED.request_enabled,
    instant_eligible = EXCLUDED.instant_eligible,
    published = EXCLUDED.published,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO markets (
    city, region, slug, time_zone, status, published, created_at, updated_at
)
VALUES
    ('Atlanta', 'GA', 'atlanta-ga', 'America/New_York', 'request_only', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Lansing', 'MI', 'lansing-mi', 'America/Detroit', 'request_only', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO UPDATE SET
    city = EXCLUDED.city,
    region = EXCLUDED.region,
    time_zone = EXCLUDED.time_zone,
    status = EXCLUDED.status,
    published = EXCLUDED.published,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
