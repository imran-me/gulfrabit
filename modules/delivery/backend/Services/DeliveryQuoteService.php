<?php

declare(strict_types=1);

namespace Modules\Delivery\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Modules\Delivery\Models\DeliveryZone;
use Modules\Delivery\Models\District;

/**
 * The authority on what delivery costs.
 *
 * Every rule about delivery pricing lives here, so controllers stay thin and the
 * checkout, cart and order pipelines cannot each invent their own arithmetic.
 *
 * The one rule that matters: **the client never sets the price.** The storefront
 * shows a quote for responsiveness, but the order pipeline must call
 * quoteForDistrict() again at capture time and charge that. A posted `cost` is
 * treated as decoration.
 */
final class DeliveryQuoteService
{
    /**
     * Zones and districts change a few times a year at most, and every checkout
     * render reads them. Cache, and bust explicitly on write.
     */
    private const CACHE_TTL = 3600;
    private const CACHE_ZONES = 'delivery:zones';
    private const CACHE_DISTRICTS = 'delivery:districts';

    /**
     * Every option a customer can choose, cheapest first.
     *
     * @return array<int, array{id:string,label:string,eta:string,cost:int}>
     */
    public function options(): array
    {
        return Cache::remember(self::CACHE_ZONES, self::CACHE_TTL, function (): array {
            return DeliveryZone::query()
                ->active()
                ->ordered()
                ->get()
                ->map(fn (DeliveryZone $zone): array => $zone->toQuote())
                ->all();
        });
    }

    /**
     * The quote for a specific district — what checkout actually charges.
     *
     * @param  string $districtKey slug from the district select, e.g. 'coxs-bazar'
     * @return array{id:string,label:string,eta:string,cost:int}|null
     *         null when the district is unknown, so the caller can 422 rather
     *         than silently falling back to a cheaper rate.
     */
    public function quoteForDistrict(string $districtKey): ?array
    {
        $district = District::query()
            ->with('zone')
            ->where('key', $districtKey)
            ->first();

        if ($district === null || ! $district->zone->is_active) {
            return null;
        }

        return $district->zone->toQuote();
    }

    /**
     * Districts for the checkout select, grouped by division so a 64-item list
     * stays navigable.
     *
     * @return array<string, array<int, array{key:string,name:string,zone:string}>>
     */
    public function districtsByDivision(): array
    {
        return Cache::remember(self::CACHE_DISTRICTS, self::CACHE_TTL, function (): array {
            return District::query()
                ->with('zone:id,key')
                ->orderBy('name')
                ->get()
                ->groupBy('division')
                ->map(fn (Collection $group): array => $group
                    ->map(fn (District $d): array => [
                        'key'  => $d->key,
                        'name' => $d->name,
                        'zone' => $d->zone->key,
                    ])
                    ->values()
                    ->all())
                ->sortKeys()
                ->all();
        });
    }

    /** Call after any zone/district write. */
    public function forgetCache(): void
    {
        Cache::forget(self::CACHE_ZONES);
        Cache::forget(self::CACHE_DISTRICTS);
    }
}
