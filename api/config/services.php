<?php
return [
 'stripe' => [
     'secret' => env('STRIPE_SECRET_KEY'),
     'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
     'payments_mode' => env('STRIPE_PAYMENTS_MODE', 'disabled'),
     'live_enabled' => filter_var(env('STRIPE_LIVE_PAYMENTS_ENABLED', false), FILTER_VALIDATE_BOOL),
 ],
 'reviews' => ['url' => env('REVIEW_URL'), 'delay_hours' => (int) env('REVIEW_DELAY_HOURS', 24), 'resend_key' => env('RESEND_API_KEY'), 'from' => env('MAIL_FROM_ADDRESS')],
 'quote_notifications' => [
     'resend_key' => env('RESEND_API_KEY'),
     'from' => env('MAIL_FROM_ADDRESS'),
     'to' => env('QUOTE_NOTIFICATION_TO', 'expressconsulting92@gmail.com'),
     'review_url' => env('STAFF_REVIEW_URL', 'https://www.expresscleaningconsult.com/admin'),
 ],
];
