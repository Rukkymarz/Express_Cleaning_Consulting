<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('staff_tasks', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('service_request_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 40)->default('quote_review');
            $table->string('status', 24)->default('open');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['service_request_id', 'kind']);
            $table->index(['status', 'due_at']);
        });

        Schema::create('quote_request_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_request_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('staff_task_id')->unique()->constrained('staff_tasks')->cascadeOnDelete();
            $table->string('status', 32)->default('queued');
            $table->json('payload');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->uuid('attempt_token')->nullable();
            $table->timestamp('last_attempt_at')->nullable();
            $table->string('provider_message_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quote_request_notifications');
        Schema::dropIfExists('staff_tasks');
    }
};
