<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Admin\Models\CustomerNote;
use Modules\Admin\Services\CustomerAnonymiserService;
use RuntimeException;

/**
 * Customer records.
 *
 * This is the most sensitive screen in the panel: it is a searchable index of
 * every person who has ever bought something, with their phone number. Two
 * consequences run through the whole class.
 *
 * 1. Only `owner` and `manager` have the `customers` capability. Warehouse
 *    sees a delivery address on a packing slip and nothing else; accounts sees
 *    money without names.
 * 2. Nothing here ever returns a password hash, a remember token or an OTP.
 *    The User model hides the first two; this class never touches the third.
 */
class AdminCustomerController extends Controller
{
    public function __construct(
        private readonly CustomerAnonymiserService $anonymiser,
    ) {
    }

    /** GET /api/admin/customers */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'       => ['sometimes', 'string', 'max:64'],
            'perPage' => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = User::query()->latest('created_at');

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            // Name, phone, email. Not a wildcard across every column — a broad
            // LIKE over an address book turns a support tool into a way to
            // trawl for people who live in a particular area.
            $query->where(function ($w) use ($term): void {
                $w->where('name', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%");
            });
        }

        $page = $query->paginate($data['perPage'] ?? 25);
        $stats = $this->orderStatsFor(collect($page->items())->pluck('id')->all());

        return response()->json([
            'data' => array_map(function (User $u) use ($stats): array {
                $s = $stats[$u->id] ?? ['orders' => 0, 'spentPoisha' => 0, 'lastAt' => null];

                return [
                    'id'         => $u->id,
                    'name'       => $u->name,
                    'phone'      => $u->phone,
                    'email'      => $u->email,
                    'tier'       => $u->tier,
                    'verified'   => $u->phone_verified_at !== null,
                    'orders'     => $s['orders'],
                    // Paid orders only. Counting placed ones would credit a
                    // customer with money they never actually handed over.
                    'spentTaka'  => intdiv($s['spentPoisha'], 100),
                    'lastOrderAt' => $s['lastAt'],
                    'joinedAt'   => $u->created_at?->toIso8601String(),
                ];
            }, $page->items()),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
            ],
        ]);
    }

    /** GET /api/admin/customers/{user} */
    public function show(User $user): JsonResponse
    {
        $orders = Schema::hasTable('orders')
            ? DB::table('orders')->where('user_id', $user->id)->latest('placed_at')->limit(50)->get()
            : collect();

        $stats = $this->orderStatsFor([$user->id])[$user->id]
            ?? ['orders' => 0, 'spentPoisha' => 0, 'lastAt' => null];

        return response()->json([
            'data' => [
                'id'       => $user->id,
                'name'     => $user->name,
                'phone'    => $user->phone,
                'email'    => $user->email,
                'tier'     => $user->tier,
                'verified' => $user->phone_verified_at !== null,
                'joinedAt' => $user->created_at?->toIso8601String(),

                'stats' => [
                    'orders'      => $stats['orders'],
                    'spentTaka'   => intdiv($stats['spentPoisha'], 100),
                    'lastOrderAt' => $stats['lastAt'],
                    // Average of PAID orders, so a string of abandoned
                    // cash-on-delivery attempts does not flatter the figure.
                    'avgOrderTaka' => $stats['orders'] > 0
                        ? intdiv(intdiv($stats['spentPoisha'], $stats['orders']), 100)
                        : 0,
                ],

                'orders' => $orders->map(fn ($o): array => [
                    'orderNumber' => $o->order_number,
                    'status'      => $o->status,
                    'paymentStatus' => $o->payment_status,
                    'totalTaka'   => intdiv((int) $o->total_poisha, 100),
                    'placedAt'    => $o->placed_at,
                ])->all(),

                'addresses' => Schema::hasTable('addresses')
                    ? DB::table('addresses')->where('user_id', $user->id)->get()->map(fn ($a): array => [
                        'label'    => $a->label ?? null,
                        'line'     => $a->address_line ?? null,
                        'district' => $a->district_name ?? null,
                        'isDefault' => (bool) ($a->is_default ?? false),
                    ])->all()
                    : [],

                'notes' => CustomerNote::query()
                    ->where('user_id', $user->id)
                    ->latest()
                    ->get()
                    ->map->toAdminArray()
                    ->all(),
            ],
        ]);
    }

    /** POST /api/admin/customers/{user}/notes */
    public function addNote(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'min:2', 'max:2000'],
        ]);

        $admin = $request->user('admin');

        $note = CustomerNote::create([
            'user_id'        => $user->id,
            'body'           => $data['body'],
            'author_admin_id' => $admin->id,
            'author_name'    => $admin->name,
        ]);

        return response()->json(['data' => $note->toAdminArray()], 201);
    }

    /**
     * POST /api/admin/customers/{user}/forget
     *
     * Owner only. This is irreversible and it edits historical order records,
     * which is not something a manager should be able to do while clearing a
     * support queue.
     */
    public function forget(Request $request, User $user): JsonResponse
    {
        $admin = $request->user('admin');

        if ($admin->role !== 'owner') {
            return response()->json([
                'message' => 'Only an owner can erase a customer.',
            ], 403);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        try {
            $this->anonymiser->anonymise($user, $data['reason'], $admin->id, $admin->name);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Customer details removed. Their order figures are unchanged.']);
    }

    /**
     * Order counts and paid totals, in one query for the whole page.
     *
     * @param array<int, int> $userIds
     * @return array<int, array{orders:int, spentPoisha:int, lastAt:?string}>
     */
    private function orderStatsFor(array $userIds): array
    {
        if ($userIds === [] || ! Schema::hasTable('orders')) {
            return [];
        }

        return DB::table('orders')
            ->selectRaw('user_id, COUNT(*) as orders, SUM(total_poisha) as spent, MAX(placed_at) as last_at')
            ->whereIn('user_id', $userIds)
            ->where('payment_status', 'paid')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id')
            ->map(fn ($r): array => [
                'orders'      => (int) $r->orders,
                'spentPoisha' => (int) $r->spent,
                'lastAt'      => $r->last_at,
            ])
            ->all();
    }
}
