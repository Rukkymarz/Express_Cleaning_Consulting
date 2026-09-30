<?php

namespace App\Services;

use Stripe\StripeClient;

class StripeInvoiceService
{
    /**
     * @param array{payment_id:int,email:string,name:string,amount_cents:int,currency:string,description:string,days_until_due:int,metadata:array<string,string>} $details
     * @return array{customer_id:string,invoice_id:string,hosted_invoice_url:?string,invoice_pdf_url:?string,status:string}
     */
    public function createTestInvoice(array $details): array
    {
        $stripe = new StripeClient(config('services.stripe.secret'));
        $keyRoot = 'ecc-invoice-payment-'.$details['payment_id'];

        $customer = $stripe->customers->create([
            'email' => $details['email'],
            'name' => $details['name'],
            'description' => 'Express Cleaning Consult approved quote customer',
            'metadata' => $details['metadata'],
        ], ['idempotency_key' => $keyRoot.'-customer']);

        $invoice = $stripe->invoices->create([
            'customer' => $customer->id,
            'collection_method' => 'send_invoice',
            'days_until_due' => $details['days_until_due'],
            'auto_advance' => false,
            'description' => $details['description'],
            'metadata' => $details['metadata'],
        ], ['idempotency_key' => $keyRoot.'-invoice']);

        $stripe->invoiceItems->create([
            'customer' => $customer->id,
            'invoice' => $invoice->id,
            'amount' => $details['amount_cents'],
            'currency' => strtolower($details['currency']),
            'description' => $details['description'],
            'metadata' => $details['metadata'],
        ], ['idempotency_key' => $keyRoot.'-item']);

        // Sending finalizes the draft and exposes Stripe's hosted payment page.
        // In a Stripe sandbox/test mode, this never moves real money.
        $sent = $stripe->invoices->sendInvoice(
            $invoice->id,
            [],
            ['idempotency_key' => $keyRoot.'-send'],
        );

        return [
            'customer_id' => $customer->id,
            'invoice_id' => $sent->id,
            'hosted_invoice_url' => $sent->hosted_invoice_url,
            'invoice_pdf_url' => $sent->invoice_pdf,
            'status' => $sent->status,
        ];
    }
}
