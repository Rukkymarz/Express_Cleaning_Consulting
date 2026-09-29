<?php
return [
 'stripe' => ['secret' => env('STRIPE_SECRET_KEY'), 'webhook_secret' => env('STRIPE_WEBHOOK_SECRET')],
 'twilio' => ['sid' => env('TWILIO_ACCOUNT_SID'), 'api_key' => env('TWILIO_API_KEY_SID'), 'api_secret' => env('TWILIO_API_KEY_SECRET'), 'auth_token' => env('TWILIO_AUTH_TOKEN'), 'app_sid' => env('TWILIO_TWIML_APP_SID'), 'number' => env('TWILIO_PHONE_NUMBER'), 'allowed_countries' => explode(',', env('TWILIO_ALLOWED_COUNTRIES', 'US'))],
 'reviews' => ['url' => env('REVIEW_URL'), 'delay_hours' => (int) env('REVIEW_DELAY_HOURS', 24), 'resend_key' => env('RESEND_API_KEY'), 'from' => env('MAIL_FROM_ADDRESS')],
];
