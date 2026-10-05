<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('sales_prospects', function (Blueprint $t) {
            $t->id(); $t->string('name'); $t->string('segment');
            $t->string('email')->nullable(); $t->string('phone',32)->nullable();
            $t->string('city')->nullable(); $t->char('region',2)->nullable();
            $t->string('service_interest')->default('Cleaning'); $t->string('source',500);
            $t->string('status')->default('new'); $t->text('notes')->nullable();
            $t->timestamp('next_follow_up_at')->nullable();
            $t->foreignId('assigned_agent_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $t->timestamps(); $t->index(['status','next_follow_up_at']); $t->index(['segment','id']);
            $t->unique('email'); $t->unique('phone');
        });
        Schema::create('prospect_reminders', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained('users'); $t->date('work_date');
            $t->string('status'); $t->string('provider_message_id')->nullable();
            $t->timestamps(); $t->unique(['user_id','work_date']);
        });
    }
    public function down(): void { Schema::dropIfExists('prospect_reminders'); Schema::dropIfExists('sales_prospects'); }
};
