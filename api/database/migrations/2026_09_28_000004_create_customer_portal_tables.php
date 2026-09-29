<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('invoices', function (Blueprint $t) {
            $t->id(); $t->ulid('public_id')->unique(); $t->string('number')->unique();
            $t->foreignId('booking_id')->unique()->constrained()->cascadeOnDelete();
            $t->char('currency',3)->default('USD'); $t->unsignedBigInteger('subtotal_cents');
            $t->unsignedBigInteger('tax_cents'); $t->unsignedBigInteger('total_cents');
            $t->timestamp('issued_at'); $t->timestamp('due_at')->nullable(); $t->timestamps();
        });
        Schema::create('service_plans', function (Blueprint $t) {
            $t->id(); $t->ulid('public_id')->unique();
            $t->foreignId('customer_id')->constrained('users');
            $t->foreignId('originating_booking_id')->unique()->constrained('bookings');
            $t->string('frequency'); $t->string('status')->default('active');
            $t->date('next_service_on')->nullable(); $t->timestamps();
            $t->index(['customer_id','status']);
        });
        Schema::create('plan_change_requests', function (Blueprint $t) {
            $t->id(); $t->foreignId('service_plan_id')->constrained()->cascadeOnDelete();
            $t->foreignId('requested_by')->constrained('users');
            $t->string('action'); $t->string('status')->default('pending');
            $t->text('reason')->nullable(); $t->timestamp('resolved_at')->nullable();
            $t->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps(); $t->index(['service_plan_id','status']);
        });
    }
    public function down(): void {
        Schema::dropIfExists('plan_change_requests');
        Schema::dropIfExists('service_plans');
        Schema::dropIfExists('invoices');
    }
};
