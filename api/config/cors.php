<?php
$configuredOrigins = array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000'))));
$firstPartyOrigins = [
    'https://www.expresscleaningconsult.com',
    'https://expresscleaningconsulting-production.up.railway.app',
];

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_unique([...$configuredOrigins, ...$firstPartyOrigins])),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
