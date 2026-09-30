<?php
namespace App\Http\Controllers;

use App\Services\PricingService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Carbon\CarbonImmutable;

class RequestController extends Controller
{
    private const US_STATE_CODES = [
        'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
        'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
    ];

    private function rules(): array
    {
        return [
            'service_code' => 'required|string|max:32|exists:service_types,code',
            'address.street' => 'required|string|max:255', 'address.unit' => 'nullable|string|max:100',
            'address.city' => 'required|string|max:100', 'address.region' => ['required','string',Rule::in(self::US_STATE_CODES)],
            'address.postal_code' => 'required|string|max:12', 'address.country' => 'required|string|size:2|in:US',
            'property.square_feet' => 'nullable|integer|min:1|max:1000000',
            'property.bedrooms' => 'nullable|integer|min:0|max:99', 'property.bathrooms' => 'nullable|integer|min:0|max:99',
            'property.condition' => 'required|in:light,moderate,heavy,unsure',
            'property.type' => 'required|in:residential,commercial,property_management,short_term_rental,construction,medical_office,retail,vehicle,other',
            'property.pets_on_site' => 'required|boolean', 'property.supplies_available' => 'required|in:yes,no,some,unsure',
            'access_notes' => 'nullable|string|max:2000',
            'preferred_start' => 'nullable|date', 'time_zone' => 'required|timezone',
            'frequency' => 'required|in:one_time,weekly,biweekly,monthly,recurring_commercial,as_needed',
            'add_on_codes' => 'array|max:10', 'add_on_codes.*' => 'string|distinct|exists:service_types,code',
            'contact.name' => 'required|string|max:150', 'contact.email' => 'required|email:rfc|max:255',
            'contact.phone' => 'required|string|max:32', 'notes' => 'nullable|string|max:3000',
            'consent.transactional_sms' => 'required|boolean', 'consent.marketing_email' => 'required|boolean',
            'consent.marketing_sms' => 'required|boolean', 'consent.review_email' => 'required|boolean',
        ];
    }

    public function catalog(): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'services' => DB::table('service_types')->where('published', true)->orderBy('category')->get(['code','slug','name','category','description','instant_eligible']),
            'markets' => DB::table('markets')->where('published', true)->get(['slug','city','region','status']),
        ]);
    }

    public function preview(Request $request, PricingService $pricing): \Illuminate\Http\JsonResponse
    {
        $rules = $this->rules();
        unset($rules['contact.name'], $rules['contact.email'], $rules['contact.phone'], $rules['consent.transactional_sms'], $rules['consent.marketing_email'], $rules['consent.marketing_sms'], $rules['consent.review_email']);
        $data = $request->validate($rules);
        return response()->json($pricing->preview($data));
    }

    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate($this->rules());
        $key = $request->header('Idempotency-Key');
        abort_unless($key && strlen($key) <= 120, 422, 'Idempotency-Key required');
        // A unique key is scoped to this endpoint; replay returns the original receipt.
        $receipt = DB::transaction(function () use ($data, $key, $request) {
            $now = now();
            $inserted = DB::table('provider_events')->insertOrIgnore(['provider' => 'public_request', 'event_id' => $key, 'event_type' => 'request.created', 'created_at' => $now, 'updated_at' => $now]);
            $receiptEvent = DB::table('provider_events')->where('provider', 'public_request')->where('event_id', $key)->lockForUpdate()->first();
            if (!$inserted) {
                $publicId = DB::table('audit_events')->where('entity_type', 'request_receipt')->where('entity_id', $receiptEvent->id)->value('action');
                return ['request_id' => $publicId, 'status' => 'received', 'next_step' => 'scope_review'];
            }
            $service = DB::table('service_types')->where('code', $data['service_code'])->where('request_enabled', true)->where('published',true)->where('category','!=','Add-on')->first();
            abort_unless($service, 422, 'Service unavailable for requests');
            $market = DB::table('markets')->where('city', $data['address']['city'])->where('region', strtoupper($data['address']['region']))->first();
            $leadId = DB::table('leads')->insertGetId(['public_id' => (string) Str::ulid(), 'customer_id' => $request->user()?->id, 'name' => $data['contact']['name'], 'email' => $data['contact']['email'], 'phone' => $data['contact']['phone'], 'source' => 'web', 'status' => 'new', 'created_at' => $now, 'updated_at' => $now]);
            $addressId = DB::table('addresses')->insertGetId(['user_id' => $request->user()?->id, 'street' => $data['address']['street'], 'unit' => $data['address']['unit'] ?? null, 'city' => $data['address']['city'], 'region' => strtoupper($data['address']['region']), 'postal_code' => $data['address']['postal_code'], 'country' => 'US', 'created_at' => $now, 'updated_at' => $now]);
            $publicId = (string) Str::ulid();
            $preferred = !empty($data['preferred_start']) ? CarbonImmutable::parse($data['preferred_start'], $data['time_zone'])->utc() : null;
            abort_if($preferred && $preferred->isPast(),422,'Preferred date must be in the future');
            $serviceRequestId = DB::table('service_requests')->insertGetId(['public_id' => $publicId, 'lead_id' => $leadId, 'address_id' => $addressId, 'service_type_id' => $service->id, 'market_id' => $market?->id, 'status' => 'received', 'property_type'=>$data['property']['type'], 'frequency' => $data['frequency'], 'square_feet' => $data['property']['square_feet'] ?? null, 'bedrooms' => $data['property']['bedrooms'] ?? null, 'bathrooms' => $data['property']['bathrooms'] ?? null, 'condition' => $data['property']['condition'], 'pets_on_site'=>$data['property']['pets_on_site'], 'supplies_available'=>$data['property']['supplies_available'], 'access_notes'=>$data['access_notes']??null, 'preferred_start_at' => $preferred, 'time_zone' => $data['time_zone'], 'scope_notes' => $data['notes'] ?? null, 'created_at' => $now, 'updated_at' => $now]);
            foreach ($data['add_on_codes'] ?? [] as $code) { $addOn = DB::table('service_types')->where('code', $code)->where('category', 'Add-on')->first(); abort_unless($addOn, 422, 'Invalid add-on'); DB::table('request_add_ons')->insert(['service_request_id' => $serviceRequestId, 'service_type_id' => $addOn->id]); }
            foreach (['transactional_sms','marketing_email','marketing_sms','review_email'] as $channel) DB::table('consents')->insert(['lead_id' => $leadId, 'channel' => $channel, 'granted' => $data['consent'][$channel], 'source' => 'booking_wizard', 'policy_version' => '2026-09', 'recorded_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('provider_events')->where('id',$receiptEvent->id)->update(['processed_at'=>$now]);
            DB::table('audit_events')->insert(['actor_id' => $request->user()?->id, 'entity_type' => 'request_receipt', 'entity_id' => $receiptEvent->id, 'action' => $publicId, 'created_at' => $now, 'updated_at' => $now]);
            app(\App\Services\LeadService::class)->sync($leadId);
            return ['request_id' => $publicId, 'status' => 'received', 'next_step' => 'scope_review'];
        });
        return response()->json($receipt, 202);
    }
}
