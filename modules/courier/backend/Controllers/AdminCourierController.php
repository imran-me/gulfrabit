<?php

declare(strict_types=1);

namespace Modules\Courier\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
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

    /**
     * The parcel board's stages, in the order a parcel passes through them.
     *
     * `handover` is first and is NOT a consignment status — it is the queue of
     * orders that are packed and waiting, which by definition have no
     * consignment yet. It belongs here because it is the one question this
     * screen exists to answer first thing in the morning: what goes out today?
     *
     * `draft` is deliberately absent. It exists for a few milliseconds inside
     * assign() between creating the row and the driver answering; a parcel that
     * is genuinely stuck there is a bug, not a stage of work, and giving it a
     * tab would dress it up as normal.
     */
    private const BOARD_STAGES = [
        'handover', 'booked', 'picked_up', 'in_transit',
        'delivered', 'failed', 'returned', 'cancelled',
    ];

    /**
     * GET /api/admin/consignments?stage=…
     *
     * The working board: one stage's parcels, plus how many sit in each of the
     * others so the tab bar can be drawn without eight more requests.
     */
    public function board(Request $request): JsonResponse
    {
        $data = $request->validate([
            'stage'   => ['sometimes', Rule::in(self::BOARD_STAGES)],
            'q'       => ['sometimes', 'string', 'max:64'],
            'perPage' => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $stage   = $data['stage'] ?? 'handover';
        $term    = trim((string) ($data['q'] ?? ''));
        $perPage = $data['perPage'] ?? 25;

        $page = $stage === 'handover'
            ? $this->handoverQueue($term)->paginate($perPage)
            : $this->parcels($stage, $term)->paginate($perPage);

        return response()->json([
            'data' => $stage === 'handover'
                ? array_map(fn (Order $o): array => $this->waitingRow($o), $page->items())
                : array_map(fn (Consignment $c): array => $this->parcelRow($c), $page->items()),
            'meta' => [
                'stage'       => $stage,
                'total'       => $page->total(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
                'counts'      => $this->boardCounts($term),
            ],
        ]);
    }

    /**
     * Orders packed and waiting for a rider, oldest first.
     *
     * Oldest first on purpose, against the habit of every other list in this
     * panel: this is a queue, and the parcel that has been sitting by the door
     * longest is the one most likely to be forgotten. Newest-first would put it
     * on page three.
     *
     * `ready_for_courier` and `packed` both count as waiting. A shop that never
     * clicks "Ready for courier" still has parcels to hand over, and a board
     * that showed them nothing would teach them the screen is broken.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Order>
     */
    private function handoverQueue(string $term)
    {
        $query = Order::query()
            ->whereIn('status', ['packed', 'ready_for_courier'])
            // Excludes anything already handed over. An order keeps its packed
            // status until a courier scan moves it, so without this the parcel
            // would appear both here and under "With courier".
            ->whereNotExists(function ($sub): void {
                $sub->selectRaw(1)
                    ->from('consignments')
                    ->whereColumn('consignments.order_id', 'orders.id')
                    ->whereNotIn('consignments.status', ['delivered', 'returned', 'cancelled']);
            })
            ->orderBy('placed_at');

        if ($term !== '') {
            $query->where(function ($w) use ($term): void {
                $w->where('order_number', 'like', "%{$term}%")
                    ->orWhere('customer_phone', 'like', "%{$term}%")
                    ->orWhere('customer_name', 'like', "%{$term}%");
            });
        }

        return $query;
    }

    /**
     * Every parcel matching the search, whatever stage it is in.
     *
     * Split out from parcels() so the tab counts can reuse the search without
     * inheriting the status filter — the same shape as the orders list, and for
     * the same reason: a tab bar has to know about the tabs you are not on.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Consignment>
     */
    private function parcelBase(string $term)
    {
        $query = Consignment::query();

        if ($term !== '') {
            $query->where(function ($w) use ($term): void {
                $w->where('tracking_number', 'like', "%{$term}%")
                    ->orWhereHas('order', function ($o) use ($term): void {
                        $o->where('order_number', 'like', "%{$term}%")
                            ->orWhere('customer_phone', 'like', "%{$term}%")
                            ->orWhere('customer_name', 'like', "%{$term}%");
                    });
            });
        }

        return $query;
    }

    /**
     * Consignments in one status, newest handover first.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Consignment>
     */
    private function parcels(string $stage, string $term)
    {
        return $this->parcelBase($term)
            ->with(['courier', 'order:id,order_number,customer_name,customer_phone,district_name,total_poisha'])
            ->where('status', $stage)
            ->latest('handed_over_at');
    }

    /**
     * How many parcels sit in each stage. Two queries, not eight.
     *
     * @return array<string, int>
     */
    private function boardCounts(string $term): array
    {
        $byStatus = $this->parcelBase($term)
            ->getQuery()
            ->select('status', DB::raw('count(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $counts = ['handover' => $this->handoverQueue($term)->count()];

        foreach (self::BOARD_STAGES as $stage) {
            if ($stage !== 'handover') {
                $counts[$stage] = (int) ($byStatus[$stage] ?? 0);
            }
        }

        return $counts;
    }

    /** One order waiting for a rider. */
    private function waitingRow(Order $o): array
    {
        return [
            'kind'          => 'order',
            'orderNumber'   => $o->order_number,
            'customerName'  => $o->customer_name,
            'customerPhone' => $o->customer_phone,
            'district'      => $o->district_name,
            'status'        => $o->status,
            'totalTaka'     => intdiv($o->total_poisha, 100),
            // What the courier will collect at the door, or nothing if the
            // order is already paid. The figure staff read off this screen when
            // filling in a courier's manifest.
            'codTaka'       => $o->payment_method === 'cod' && $o->payment_status !== 'paid'
                ? intdiv($o->total_poisha, 100)
                : 0,
            'placedAt'      => $o->placed_at?->toIso8601String(),
        ];
    }

    /** One parcel with a courier. */
    private function parcelRow(Consignment $c): array
    {
        return [
            'kind'           => 'consignment',
            'id'             => $c->id,
            'orderNumber'    => $c->order?->order_number,
            'customerName'   => $c->order?->customer_name,
            'customerPhone'  => $c->order?->customer_phone,
            'district'       => $c->order?->district_name,
            'courier'        => $c->courier?->name,
            'trackingNumber' => $c->tracking_number,
            'trackingUrl'    => $c->courier?->trackingUrl($c->tracking_number),
            'status'         => $c->status,
            'codTaka'        => intdiv($c->cod_amount_poisha, 100),
            'codRemitted'    => (bool) $c->cod_remitted,
            'handedOverAt'   => $c->handed_over_at?->toIso8601String(),
        ];
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
