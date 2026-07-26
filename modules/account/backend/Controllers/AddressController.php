<?php

declare(strict_types=1);

namespace Modules\Account\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Account\Models\Address;
use Modules\Account\Requests\AddressRequest;
use Modules\Account\Services\AddressService;

/**
 * Saved addresses.
 *
 * Every method resolves the address THROUGH the authenticated user rather than
 * by id alone. Looking up by id and then comparing user_id is the same idea
 * written less safely — one forgotten check and any customer can read or delete
 * another's address.
 */
class AddressController extends Controller
{
    public function __construct(
        private readonly AddressService $addresses,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->addresses->listFor((int) $request->user()->id),
        ]);
    }

    public function store(AddressRequest $request): JsonResponse
    {
        $address = $this->addresses->create((int) $request->user()->id, $request->validated());

        return response()->json([
            'data' => $address->load('district')->toStorefrontArray(),
        ], 201);
    }

    public function update(AddressRequest $request, int $id): JsonResponse
    {
        $address = $this->ownedOrFail($request, $id);

        return response()->json([
            'data' => $this->addresses->update($address, $request->validated())->toStorefrontArray(),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->addresses->delete($this->ownedOrFail($request, $id));

        return response()->json(['message' => 'Address removed.']);
    }

    public function makeDefault(Request $request, int $id): JsonResponse
    {
        $address = $this->ownedOrFail($request, $id);

        return response()->json([
            'data' => $this->addresses->makeDefault($address)->toStorefrontArray(),
        ]);
    }

    /**
     * 404 rather than 403 for someone else's address: confirming that an id
     * exists is itself information worth withholding.
     */
    private function ownedOrFail(Request $request, int $id): Address
    {
        return Address::query()
            ->where('user_id', $request->user()->id)
            ->with('district')
            ->findOrFail($id);
    }
}
