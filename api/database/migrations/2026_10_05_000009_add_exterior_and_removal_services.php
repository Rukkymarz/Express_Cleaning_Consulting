<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
return new class extends Migration {
    public function up(): void {
        foreach ([['JUNK','junk-removal','Junk Removal'],['PRESSURE','pressure-washing','Pressure Washing']] as [$code,$slug,$name]) {
            DB::table('service_types')->insertOrIgnore(['code'=>$code,'slug'=>$slug,'name'=>$name,'category'=>'Specialty','request_enabled'=>true,'instant_eligible'=>false,'published'=>true,'created_at'=>now(),'updated_at'=>now()]);
        }
    }
    public function down(): void {
        // Preserve services referenced by customer requests during rollback.
        DB::table('service_types')->whereIn('code',['JUNK','PRESSURE'])->update(['request_enabled'=>false,'published'=>false,'updated_at'=>now()]);
    }
};
