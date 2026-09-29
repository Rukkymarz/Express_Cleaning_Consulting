<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void { Schema::create('agent_presence',function(Blueprint $t){$t->foreignId('agent_id')->primary()->constrained('users')->cascadeOnDelete();$t->boolean('available')->default(false);$t->timestamp('last_seen_at')->nullable();$t->timestamps();$t->index(['available','last_seen_at']);}); }
 public function down(): void { Schema::dropIfExists('agent_presence'); }
};
