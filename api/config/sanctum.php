<?php
$configuredStatefulDomains = array_filter(array_map('trim', explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost,localhost:3000'))));
$firstPartyDomains = ['www.expresscleaningconsult.com', 'expresscleaningconsulting-production.up.railway.app'];

return [
 'stateful' => array_values(array_unique([...$configuredStatefulDomains, ...$firstPartyDomains])),
 'guard' => ['web'], 'expiration' => null,
 'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),
 'middleware' => ['authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class, 'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class, 'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class],
];
