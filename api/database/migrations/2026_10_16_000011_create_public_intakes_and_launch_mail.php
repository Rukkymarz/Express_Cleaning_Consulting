<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up():void {
  Schema::create('public_intakes',function(Blueprint $t){$t->id();$t->ulid('public_id')->unique();$t->string('kind',24)->index();$t->string('request_key',120)->unique();$t->string('payload_hash',64);$t->string('name')->nullable();$t->string('email');$t->string('status',24)->default('open')->index();$t->json('details');$t->boolean('marketing_email')->default(false);$t->string('policy_version',32)->default('2026-10-16');$t->timestamps();});
  Schema::create('launch_mail_outbox',function(Blueprint $t){$t->id();$t->string('message_key',150)->unique();$t->string('recipient');$t->string('subject');$t->text('body');$t->string('status',32)->default('queued')->index();$t->unsignedTinyInteger('attempts')->default(0);$t->timestamp('first_attempt_at')->nullable();$t->timestamp('sent_at')->nullable();$t->string('provider_message_id')->nullable();$t->string('failure_reason')->nullable();$t->timestamps();});
 }
 public function down():void {Schema::dropIfExists('launch_mail_outbox');Schema::dropIfExists('public_intakes');}
};
