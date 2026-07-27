<?php

declare(strict_types=1);

namespace Modules\Courier\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;
use Modules\Courier\Models\Consignment;
use Modules\Courier\Models\Courier;
use Modules\Courier\Requests\AssignCourierRequest;
use Modules\Courier\Requests\ConsignmentStatusRequest;
use Modules\Courier\Services\ConsignmentService;
use Modules\Courier\Services\DriverRegistry;
use RuntimeException;

/**
 * Courier screens inside the admin panel.
 *
 * Lives in modules/courier rather than modules/admin so the whole feature —
 * schema, rules and screens — leaves together. Admin's only knowledge of
 * couriers is one line in tools/assemble.py loading a nav file.
 */
class AdminCourierController extends Controller
{
    public function __construct(
        private readonly ConsignmentService $consignments,
        private readonly DriverRegistry $drivers,
    ) {
    }

    /**
     * GET /api/admin/couriers
     *
     * Reports `isConfigured` and `hasDriver` separately so the panel can say
     * exactly why a courier cannot be booked automatically, rather than hiding
     * it and leaving staff wondering where Pathao went.
     */
    public function index(): JsonResponse
    {
        $couriers = Courier::query()->usable()->get()->map(
            fn (Courier $c): array => $c->toAdminArray() + [
                'hasDriver'  => $this->drivers->hasDriver($c->driver),
                'manualOnly' => $c->driver === 'manual',
            ],
        );

        return response()->json(['data' => $couriers->all()]);
    }

    /** GET /api/admin/orders/{order}/consignments */
    public function forOrder(Order $order): JsonResponse
    {
        $list = Consignment::query()
            ->with(['courier', 'events'])
            ->where('order_id', $order->id)
            ->latest()
            ->get();

        return response()->json(['data' => $list->map->toAdminArray()->all()]);
    }

    /** POST /api/admin/orders/{order}/consignments */
    public function assign(AssignCourierRequest $request, Order $order): JsonResponse
    {
        $admin = $request->user('admin');
        $courier = Courier::query()->where('key', $request->string('courierKey'))->firstOrFail();

        try {
            $consignment = $this->consignments->assign(
                order:          $order,
                courier:        $courier,
                adminId:        $admin->id,
                adminName:      $admin->name,
                trackingNumber: $request->input('trackingNumber'),
                costPoisha:     $request->filled('costTaka')
                    ? (int) round($request->float('costTaka') * 100)
                    : null,
                note:           $request->input('note'),
            );
        } catch (RuntimeException $e) {
            // A business rule said no, and the staff member can pick another
            // courier. Not a server fault.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $consignment->toAdminArray()], 201);
    }

    /** POST /api/admin/consignments/{consignment}/status */
    public function status(ConsignmentStatusRequest $request, Consignment $consignment): JsonResponse
    {
        $admin = $request->user('admin');

        $consignment = $this->consignments->recordStatus(
            consignment: $consignment,
            status:      $request->string('status')->toString(),
            // Typed by a person, so the trail says so. Only a real courier
            // integration may ever write 'courier'.
            source:      'staff',
            actorName:   $admin->name,
            description: $request->input('description'),
            location:    $request->input('location'),
        );

        return response()->json(['data' => $consignment->toAdminArray()]);
    }
}
