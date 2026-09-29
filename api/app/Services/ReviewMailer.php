<?php
namespace App\Services;

class ReviewMailer
{
    public function send(string $key, string $from, string $to, string $name, string $url, int $bookingId): string
    {
        $email=\Resend::client($key)->emails->send([
            'from'=>$from,'to'=>[$to],'subject'=>'How did your cleaning go?',
            'text'=>"Hello {$name},\n\nThank you for choosing Express Cleaning Consult. We would appreciate your honest feedback about your recent service. You can share it here: {$url}\n\nThank you,\nExpress Cleaning Consult",
        ],['idempotency_key'=>'review-booking-'.$bookingId]);
        return $email->id;
    }
}
