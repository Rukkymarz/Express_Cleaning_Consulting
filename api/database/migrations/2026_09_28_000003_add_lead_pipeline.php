<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('pipeline_stage', 32)->default('new_lead');
            $table->unsignedTinyInteger('lead_score')->default(0);
            $table->timestamp('scored_at')->nullable();
            $table->index(['pipeline_stage', 'lead_score', 'id'], 'leads_pipeline_score_idx');
            $table->index(['assigned_agent_id', 'pipeline_stage', 'id'], 'leads_agent_pipeline_idx');
        });
    }
    public function down(): void {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex('leads_pipeline_score_idx');
            $table->dropIndex('leads_agent_pipeline_idx');
            $table->dropColumn(['pipeline_stage', 'lead_score', 'scored_at']);
        });
    }
};
