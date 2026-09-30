<?php
return [
 'stripe' => [
     'secret' => env('STRIPE_SECRET_KEY'),
     'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
     'payments_mode' => env('STRIPE_PAYMENTS_MODE', 'disabled'),
     'live_enabled' => filter_var(env('STRIPE_LIVE_PAYMENTS_ENABLED', false), FILTER_VALIDATE_BOOL),
 ],
 'twilio' => ['sid' => env('TWILIO_ACCOUNT_SID'), 'api_key' => env('TWILIO_API_KEY_SID'), 'api_secret' => env('TWILIO_API_KEY_SECRET'), 'auth_token' => env('TWILIO_AUTH_TOKEN'), 'app_sid' => env('TWILIO_TWIML_APP_SID'), 'number' => env('TWILIO_PHONE_NUMBER'), 'allowed_countries' => explode(',', env('TWILIO_ALLOWED_COUNTRIES', 'US'))],
 'reviews' => ['url' => env('REVIEW_URL'), 'delay_hours' => (int) env('REVIEW_DELAY_HOURS', 24), 'resend_key' => env('RESEND_API_KEY'), 'from' => env('MAIL_FROM_ADDRESS')],
 'quote_notifications' => [
     'resend_key' => env('RESEND_API_KEY'),
     'from' => env('MAIL_FROM_ADDRESS'),
     'to' => env('QUOTE_NOTIFICATION_TO', 'expressconsulting92@gmail.com'),
     'review_url' => env('STAFF_REVIEW_URL', 'https://www.expresscleaningconsult.com/admin'),
 ],
];
