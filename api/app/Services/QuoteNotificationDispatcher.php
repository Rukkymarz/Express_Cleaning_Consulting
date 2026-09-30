<?php

namespace App\Services;

use App\Jobs\SendQuoteRequestNotification;

class QuoteNotificationDispatcher
{
    public function dispatch(int $serviceRequestId): void
    {
        SendQuoteRequestNotification::dispatch($serviceRequestId)
            ->onConnection('database')
            ->onQueue('quote-notifications');
    }
}
