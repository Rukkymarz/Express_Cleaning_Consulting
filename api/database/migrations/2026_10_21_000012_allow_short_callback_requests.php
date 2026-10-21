<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('addresses', function (Blueprint $table) {
            $table->string('street')->nullable()->change();
            $table->string('city')->nullable()->change();
            $table->char('region', 2)->nullable()->change();
        });
        Schema::table('service_requests', function (Blueprint $table) {
            $table->string('frequency')->nullable()->change();
            $table->string('time_zone')->nullable()->change();
            $table->boolean('pets_on_site')->nullable()->default(null)->change();
        });
    }
    public function down(): void {
        // Keep the relaxed columns: restoring NOT NULL would invalidate saved callback requests.
    }
};
