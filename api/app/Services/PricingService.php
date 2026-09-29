<?php
namespace App\Services;

use Illuminate\Support\Facades\DB;

class PricingService
{
    public function preview(array $scope): array
    {
        $service = DB::table('service_types')->where('code', $scope['service_code'])->first();
        $market = DB::table('markets')->where('city', $scope['address']['city'])->where('region', strtoupper($scope['address']['region']))->first();
        if (!$service?->instant_eligible || !$market || $market->status !== 'instant_enabled' || !empty($scope['add_on_codes']) || $scope['property']['condition'] !== 'light' || $scope['frequency'] !== 'one_time') {
            return ['eligible' => false, 'reason' => 'A team member will review the scope and availability.'];
        }
        $size = $scope['property']['square_feet'] ?? null;
        if (!$size) return ['eligible' => false, 'reason' => 'Property size needs review.'];
        $rule = DB::table('pricing_rules')->where('service_type_id', $service->id)->where('market_id', $market->id)->where('approved', true)->where('min_square_feet', '<=', $size)->where(fn ($q) => $q->whereNull('max_square_feet')->orWhere('max_square_feet','>=',$size))->where('effective_from','<=', now())->where(fn ($q) => $q->whereNull('effective_until')->orWhere('effective_until','>',now()))->orderByDesc('version')->first();
        if (!$rule) return ['eligible' => false, 'reason' => 'A team member will prepare your quote.'];
        $cents = $rule->base_cents + $size * $rule->per_square_foot_cents + ($scope['property']['bedrooms'] ?? 0) * $rule->per_bedroom_cents + ($scope['property']['bathrooms'] ?? 0) * $rule->per_bathroom_cents;
        return ['eligible' => true, 'estimate_cents' => $cents, 'currency' => 'USD', 'price_rule_version' => $rule->version, 'notice' => 'Estimate only. Final price and appointment require review.'];
    }
}
