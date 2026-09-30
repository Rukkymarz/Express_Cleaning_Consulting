<?php

namespace App\Services;

class QuoteRequestMailer
{
    /**
     * @param array{receipt:string,customer_name:string,email:string,phone:string,service:string,location:string,task_status:string,review_url:string} $details
     */
    public function send(string $key, string $from, string $to, array $details): string
    {
        $text = implode("\n", [
            'A new free-quote request is ready for review.',
            '',
            'Receipt: '.$details['receipt'],
            'Customer: '.$details['customer_name'],
            'Email: '.$details['email'],
            'Phone: '.$details['phone'],
            'Service: '.$details['service'],
            'Location: '.$details['location'],
            'Task status: '.$details['task_status'],
            '',
            'Review the request in the staff workflow: '.$details['review_url'],
            'Search for receipt '.$details['receipt'].' if the request is not already filtered.',
        ]);

        $email = \Resend::client($key)->emails->send([
            'from' => $from,
            'to' => [$to],
            'subject' => 'New quote request '.$details['receipt'],
            'text' => $text,
        ], [
            'idempotency_key' => 'quote-request-'.$details['receipt'],
        ]);

        return $email->id;
    }
}
