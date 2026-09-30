<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            // Existing rows cannot be safely inferred as test or live from a Stripe ID alone.
            $table->string('environment', 8)->default('legacy');
            $table->string('stripe_invoice_id')->nullable()->unique();
            $table->string('stripe_customer_id')->nullable();
            $table->text('hosted_invoice_url')->nullable();
            $table->text('invoice_pdf_url')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->string('failure_code')->nullable();
            $table->text('failure_message')->nullable();
            $table->index(['booking_id', 'environment', 'kind', 'status'], 'payments_booking_env_kind_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('payments_booking_env_kind_status_idx');
            $table->dropUnique(['stripe_invoice_id']);
            $table->dropColumn([
                'environment', 'stripe_invoice_id', 'stripe_customer_id', 'hosted_invoice_url',
                'invoice_pdf_url', 'paid_at', 'failed_at', 'failure_code', 'failure_message',
            ]);
        });
    }
};
