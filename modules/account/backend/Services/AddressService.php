<?php

declare(strict_types=1);

namespace Modules\Account\Services;

use Illuminate\Support\Facades\DB;
use Modules\Account\Models\Address;

/**
 * Address rules — chiefly the one invariant that is easy to get wrong.
 *
 * **Exactly one default per user.** Not zero (checkout would have nothing to
 * pre-fill), not two (checkout would have to guess). Every write path here
 * maintains that, inside a transaction, rather than leaving it to whichever
 * controller happens to be calling.
 */
final class AddressService
{
    /** @return array<int, array<string, mixed>> */
    public function listFor(int $userId): array
    {
        return Address::query()
            ->where('user_id', $userId)
            ->with('district:id,key,name')
            ->ordered()
            ->get()
            ->map(fn (Address $a) => $a->toStorefrontArray())
            ->all();
    }

    public function create(int $userId, array $data): Address
    {
        return DB::transaction(function () use ($userId, $data): Address {
            // The first address a customer saves is their default, whatever
            // they ticked — an account with addresses and no default is a
            // checkout with nothing to pre-fill.
            $isFirst = ! Address::where('user_id', $userId)->exists();
            $makeDefault = $isFirst || ! empty($data['isDefault']);

            if ($makeDefault) {
                $this->clearDefault($userId);
            }

            return Address::create([
                'user_id'         => $userId,
                'label'           => $data['label'] ?? 'Home',
                'recipient_name'  => $data['name'],
                'recipient_phone' => $data['phone'],
                'line1'           => $data['line1'],
                'area'            => $data['area'] ?? null,
                'district_id'     => $data['districtId'],
                'notes'           => $data['notes'] ?? null,
                'is_default'      => $makeDefault,
            ]);
        });
    }

    public function update(Address $address, array $data): Address
    {
        return DB::transaction(function () use ($address, $data): Address {
            if (! empty($data['isDefault']) && ! $address->is_default) {
                $this->clearDefault((int) $address->user_id);
                $address->is_default = true;
            }

            $address->fill([
                'label'           => $data['label'] ?? $address->label,
                'recipient_name'  => $data['name'] ?? $address->recipient_name,
                'recipient_phone' => $data['phone'] ?? $address->recipient_phone,
                'line1'           => $data['line1'] ?? $address->line1,
                'area'            => $data['area'] ?? $address->area,
                'district_id'     => $data['districtId'] ?? $address->district_id,
                'notes'           => $data['notes'] ?? $address->notes,
            ])->save();

            return $address->fresh(['district']);
        });
    }

    /**
     * Deleting the default promotes the next address, so the invariant holds
     * without the customer having to notice or fix anything.
     */
    public function delete(Address $address): void
    {
        DB::transaction(function () use ($address): void {
            $userId = (int) $address->user_id;
            $wasDefault = $address->is_default;

            $address->delete();

            if ($wasDefault) {
                Address::where('user_id', $userId)
                    ->orderByDesc('id')
                    ->first()
                    ?->update(['is_default' => true]);
            }
        });
    }

    public function makeDefault(Address $address): Address
    {
        return DB::transaction(function () use ($address): Address {
            $this->clearDefault((int) $address->user_id);
            $address->update(['is_default' => true]);

            return $address->fresh(['district']);
        });
    }

    private function clearDefault(int $userId): void
    {
        Address::where('user_id', $userId)->where('is_default', true)->update(['is_default' => false]);
    }
}
