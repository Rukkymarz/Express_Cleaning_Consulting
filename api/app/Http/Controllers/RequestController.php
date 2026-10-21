<?php
namespace App\Http\Controllers;

use App\Services\PricingService;
use App\Services\QuoteNotificationDispatcher;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
            'contact.phone' => 'required|string|max:32', 'promotion_code'=>'nullable|in:FIRSTCLEAN10', 'notes' => 'nullable|string|max:3000',
            'consent.transactional_sms' => 'required|boolean', 'consent.marketing_email' => 'required|boolean',
            'consent.marketing_sms' => 'required|boolean', 'consent.review_email' => 'required|boolean',
        ];
    }

    private function callbackRules(): array
    {
        return [
            'request_kind' => 'required|in:callback',
            'service_code' => 'required|string|max:32|exists:service_types,code',
            'address.postal_code' => ['required', 'string', 'regex:/^\d{5}(-\d{4})?$/'],
            'contact.name' => 'required|string|min:2|max:150',
            'contact.phone' => ['required', 'string', 'max:32', 'regex:/^\+?[0-9().\s-]+$/', function ($attribute, $value, $fail) {
                $digits = preg_replace('/\D/', '', $value);
                if (!preg_match('/^(?:1)?[2-9][0-9]{2}[2-9][0-9]{6}$/', $digits)) $fail('Enter a valid US phone number.');
            }],
            'contact.email' => 'nullable|email:rfc|max:255',
            'notes' => 'nullable|string|max:3000',
            'promotion_code' => 'nullable|in:FIRSTCLEAN10',
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

    public function status(string $requestId): \Illuminate\Http\JsonResponse
    {
        $workflow = DB::table('service_requests as sr')
            ->join('staff_tasks as task', function ($join) {
                $join->on('task.service_request_id', '=', 'sr.id')->where('task.kind', '=', 'quote_review');
            })
            ->join('quote_request_notifications as notification', 'notification.service_request_id', '=', 'sr.id')
            ->where('sr.public_id', $requestId)
            ->first([
                'sr.public_id as request_id', 'sr.status as request_status',
                'task.status as task_status', 'notification.status as notification_status',
            ]);
        abort_unless($workflow, 404);
        return response()->json($workflow);
    }

    public function store(Request $request, QuoteNotificationDispatcher $notifications): \Illuminate\Http\JsonResponse
    {
        $callback = $request->input('request_kind') === 'callback';
        $data = $request->validate($callback ? $this->callbackRules() : $this->rules());
        if ($callback) {
            // Unknown scope stays unknown; the staff task is a request to call, not a booking.
            $data['address'] += ['street' => null, 'unit' => null, 'city' => null, 'region' => null, 'country' => 'US'];
            $data['contact']['email'] = $data['contact']['email'] ?? null;
            $data['property'] = ['type' => 'other', 'condition' => 'unsure', 'pets_on_site' => null, 'supplies_available' => 'unsure'];
            $data['frequency'] = null;
            $data['time_zone'] = null;
            $data['consent'] = array_fill_keys(['transactional_sms','marketing_email','marketing_sms','review_email'], false);
            $data['notes'] = "Callback requested. Confirm address, property details, cleaning scope and preferred date by phone.\n".($data['notes'] ?? '');
        }
        $region = isset($data['address']['region']) ? strtoupper($data['address']['region']) : null;
        $key = $request->header('Idempotency-Key');
        abort_unless($key && strlen($key) <= 120, 422, 'Idempotency-Key required');
        // A unique key is scoped to this endpoint; replay returns the original receipt.
        $result = DB::transaction(function () use ($data, $key, $request, $callback, $region) {
            $now = now();
            $inserted = DB::table('provider_events')->insertOrIgnore(['provider' => 'public_request', 'event_id' => $key, 'event_type' => 'request.created', 'created_at' => $now, 'updated_at' => $now]);
            $receiptEvent = DB::table('provider_events')->where('provider', 'public_request')->where('event_id', $key)->lockForUpdate()->first();
            if (!$inserted) {
                $publicId = DB::table('audit_events')->where('entity_type', 'request_receipt')->where('entity_id', $receiptEvent->id)->value('action');
                $serviceRequestId = DB::table('service_requests')->where('public_id', $publicId)->value('id');
                return [
                    'receipt' => ['request_id' => $publicId, 'status' => 'received', 'next_step' => 'scope_review'],
                    'created' => false,
                    'service_request_id' => (int) $serviceRequestId,
                ];
            }
            $service = DB::table('service_types')->where('code', $data['service_code'])->where('request_enabled', true)->where('published',true)->where('category','!=','Add-on')->first();
            abort_unless($service, 422, 'Service unavailable for requests');
            $market = $region && $data['address']['city'] ? DB::table('markets')->where('city', $data['address']['city'])->where('region', $region)->first() : null;
            $leadId = DB::table('leads')->insertGetId(['public_id' => (string) Str::ulid(), 'customer_id' => $request->user()?->id, 'name' => $data['contact']['name'], 'email' => $data['contact']['email'], 'phone' => $data['contact']['phone'], 'source' => 'web', 'status' => 'new', 'created_at' => $now, 'updated_at' => $now]);
            $addressId = DB::table('addresses')->insertGetId(['user_id' => $request->user()?->id, 'street' => $data['address']['street'], 'unit' => $data['address']['unit'] ?? null, 'city' => $data['address']['city'], 'region' => $region, 'postal_code' => $data['address']['postal_code'], 'country' => 'US', 'created_at' => $now, 'updated_at' => $now]);
            $publicId = (string) Str::ulid();
            $preferred = !empty($data['preferred_start']) ? CarbonImmutable::parse($data['preferred_start'], $data['time_zone'])->utc() : null;
            abort_if($preferred && $preferred->isPast(),422,'Preferred date must be in the future');
            $serviceRequestId = DB::table('service_requests')->insertGetId(['public_id' => $publicId, 'lead_id' => $leadId, 'address_id' => $addressId, 'service_type_id' => $service->id, 'market_id' => $market?->id, 'status' => 'received', 'property_type'=>$data['property']['type'], 'frequency' => $data['frequency'], 'square_feet' => $data['property']['square_feet'] ?? null, 'bedrooms' => $data['property']['bedrooms'] ?? null, 'bathrooms' => $data['property']['bathrooms'] ?? null, 'condition' => $data['property']['condition'], 'pets_on_site'=>$data['property']['pets_on_site'], 'supplies_available'=>$data['property']['supplies_available'], 'access_notes'=>$data['access_notes']??null, 'preferred_start_at' => $preferred, 'time_zone' => $data['time_zone'], 'scope_notes' => trim(($data['notes'] ?? '').(!empty($data['promotion_code']) ? "\nRequested offer: FIRSTCLEAN10 (10% up to $30; staff must confirm eligibility before quote approval)." : '')), 'created_at' => $now, 'updated_at' => $now]);
            foreach ($data['add_on_codes'] ?? [] as $code) { $addOn = DB::table('service_types')->where('code', $code)->where('category', 'Add-on')->first(); abort_unless($addOn, 422, 'Invalid add-on'); DB::table('request_add_ons')->insert(['service_request_id' => $serviceRequestId, 'service_type_id' => $addOn->id]); }
            foreach (['transactional_sms','marketing_email','marketing_sms','review_email'] as $channel) DB::table('consents')->insert(['lead_id' => $leadId, 'channel' => $channel, 'granted' => $data['consent'][$channel], 'source' => $callback ? 'callback_form' : 'booking_wizard', 'policy_version' => '2026-09', 'recorded_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('provider_events')->where('id',$receiptEvent->id)->update(['processed_at'=>$now]);
            DB::table('audit_events')->insert(['actor_id' => $request->user()?->id, 'entity_type' => 'request_receipt', 'entity_id' => $receiptEvent->id, 'action' => $publicId, 'created_at' => $now, 'updated_at' => $now]);
            $taskId = DB::table('staff_tasks')->insertGetId([
                'public_id' => (string) Str::ulid(),
                'service_request_id' => $serviceRequestId,
                'kind' => 'quote_review',
                'status' => 'open',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('quote_request_notifications')->insert([
                'service_request_id' => $serviceRequestId,
                'staff_task_id' => $taskId,
                'status' => 'queued',
                'payload' => json_encode([
                    'receipt' => $publicId,
                    'customer_name' => $data['contact']['name'],
                    'email' => $data['contact']['email'] ?? 'Not provided — call customer',
                    'phone' => $data['contact']['phone'],
                    'service' => $service->name,
                    'location' => $callback ? 'ZIP '.$data['address']['postal_code'].' — call to confirm address and scope.' : $data['address']['street']
                        .(!empty($data['address']['unit']) ? ', '.$data['address']['unit'] : '')
                        .', '.$data['address']['city'].', '.strtoupper($data['address']['region']).' '.$data['address']['postal_code'],
                    'task_status' => 'open',
                    'review_url' => config('services.quote_notifications.review_url'),
                ], JSON_THROW_ON_ERROR),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            if (!empty($data['contact']['email'])) app(\App\Services\LaunchMail::class)->queue('quote-confirmation-'.$publicId,$data['contact']['email'],'We received your cleaning quote request',
                "Hello ".$data['contact']['name'].",\n\nWe received your free quote request.\nReference: ".$publicId."\nService: ".$service->name."\nZIP: ".$data['address']['postal_code']."\n\nOur team will call you to confirm the address, cleaning details, pricing and availability. This is not a confirmed booking, and no payment has been taken.\n\nQuestions? Reply to support@expresscleaningconsult.com or call (281) 972-7712.");
            app(\App\Services\LeadService::class)->sync($leadId);
            return [
                'receipt' => ['request_id' => $publicId, 'status' => 'received', 'next_step' => 'scope_review'],
                'created' => true,
                'service_request_id' => $serviceRequestId,
            ];
        });

        // The database queue makes provider work durable without delaying the public receipt.
        if ($result['created']) {
            try {
                $notifications->dispatch($result['service_request_id']);
            } catch (\Throwable $error) {
                // The notification outbox row remains queued for the recovery process.
                Log::error('Quote notification could not be queued and will be recovered.', [
                    'service_request_id' => $result['service_request_id'],
                    'exception_class' => $error::class,
                ]);
                report($error);
            }
        }

        $workflow = DB::table('staff_tasks as t')
            ->join('quote_request_notifications as n', 'n.staff_task_id', '=', 't.id')
            ->where('t.service_request_id', $result['service_request_id'])
            ->where('t.kind', 'quote_review')
            ->first(['t.status as task_status', 'n.status as notification_status']);

        return response()->json([
            ...$result['receipt'],
            'workflow' => [
                'task_status' => $workflow?->task_status,
                'notification_status' => $workflow?->notification_status,
            ],
        ], 202);
    }
}
