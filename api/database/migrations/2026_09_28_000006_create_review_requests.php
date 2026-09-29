<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('review_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('status')->default('queued');
            $t->string('provider_message_id')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->string('reason')->nullable();
            $t->timestamps();
            $t->index(['status','created_at']);
        });
    }
    public function down(): void { Schema::dropIfExists('review_requests'); }
};
