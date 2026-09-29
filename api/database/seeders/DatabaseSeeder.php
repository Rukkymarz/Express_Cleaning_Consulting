<?php
namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
 public function run(): void {
  $permissions=['leads.view','leads.edit','quotes.issue','bookings.dispatch','calls.place','campaigns.manage','workers.approve'];
  foreach($permissions as $p) Permission::findOrCreate($p,'web');
  $roles=['owner'=>$permissions,'sales_agent'=>['leads.view','leads.edit','quotes.issue','calls.place'],'dispatcher'=>['leads.view','bookings.dispatch'],'marketing_agent'=>['leads.view','campaigns.manage'],'worker'=>[],'customer'=>[]];
  foreach($roles as $name=>$abilities) { $role=Role::findOrCreate($name,'web'); $role->syncPermissions($abilities); }
  $services=[
   ['RES-STD','standard-home-cleaning','Standard Residential Cleaning','Residential'],['RES-DEEP','deep-cleaning','Deep Cleaning','Residential'],['MOVE-IN','move-in-cleaning','Move-In Cleaning','Residential'],['MOVE-OUT','move-out-cleaning','Move-Out Cleaning','Residential'],['APT-TURN','apartment-turnover','Apartment Turnover / Make-Ready','Property Management'],['AIRBNB','airbnb-turnover','Airbnb / STR Turnover','Property Management'],['COMM-OFF','office-cleaning','Office Cleaning','Commercial'],['JANITORIAL','janitorial','Recurring Janitorial Service','Commercial'],['MED-OFF','medical-office-cleaning','Medical / Professional Office Cleaning','Commercial'],['RETAIL','retail-cleaning','Retail / Storefront Cleaning','Commercial'],['POST-CON','post-construction-cleaning','Post-Construction Cleaning','Specialty'],['COMMON','common-area-cleaning','Common Area Cleaning','Property Management'],['EVENT','event-cleaning','Event Cleaning','Specialty'],['FLOOR','floor-care','Floor Care','Specialty'],['WINDOW-INT','interior-glass-cleaning','Interior Window / Glass Cleaning','Specialty'],['AUTO','vehicle-cleaning','Vehicle Cleaning','Specialty'],
   ['FRIDGE','inside-refrigerator','Inside Refrigerator','Add-on'],['OVEN','inside-oven','Inside Oven','Add-on'],['CABINETS','inside-cabinets','Inside Cabinets','Add-on'],['LAUNDRY','laundry-linen','Laundry / Linen','Add-on'],['ORGANIZE','light-organization','Light Organization','Add-on'],
  ];
  foreach($services as [$code,$slug,$name,$category]) DB::table('service_types')->updateOrInsert(['code'=>$code],['slug'=>$slug,'name'=>$name,'category'=>$category,'request_enabled'=>true,'instant_eligible'=>false,'published'=>$category!=='Add-on','created_at'=>now(),'updated_at'=>now()]);
  // These are request-only candidate markets. The owner must approve published local SEO pages and ZIP coverage.
  foreach([['Atlanta','GA','America/New_York'],['Lansing','MI','America/Detroit']] as [$city,$region,$zone]) DB::table('markets')->updateOrInsert(['slug'=>strtolower($city).'-'.strtolower($region)],['city'=>$city,'region'=>$region,'time_zone'=>$zone,'status'=>'request_only','published'=>false,'created_at'=>now(),'updated_at'=>now()]);
 }
}
