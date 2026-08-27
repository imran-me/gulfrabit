<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Admin\Models\AdminUser;
use Modules\Admin\Models\AdminUserEvent;
use Modules\Admin\Requests\StaffStoreRequest;
use Modules\Admin\Requests\StaffUpdateRequest;

/**
 * Staff accounts: who works here, and what each of them may do.
 *
 * This is the screen that hands out access, which makes it the screen anyone
 * with a foothold in the panel wants most. Four decisions follow from that and
 * run through every method below.
 *
 * OWNER ONLY, AND NOT AS A COURTESY
 * ---------------------------------
 * Every route here is behind `admin:staff`, and `owner` is the only role that
 * holds that capability — see AdminUser::CAPABILITIES. A manager cannot read
 * this list, let alone appoint anybody. The screen is also absent from their
 * sidebar, but that is decoration; the middleware is the control.
 *
 * NOBODY IS EVER DELETED
 * ----------------------
 * There is no destroy() here, and there is not meant to be. An ex-employee's
 * name is on stock movements, order transitions, refunds and journal entries,
 * and an audit trail whose actor ids point at nothing has stopped answering
 * the one question it exists for. So accounts are DISABLED instead: they
 * cannot sign in, they keep every record they touched, and they can be
 * switched back on the day somebody returns from leave. The table carries no
 * `deleted_at` column at all — the same decision, recorded one layer down in
 * the 2026_07_27 migration.
 *
 * THIS PANEL MUST ALWAYS HAVE AN ACTIVE OWNER
 * -------------------------------------------
 * A panel with no active owner cannot appoint one, because appointing is
 * itself an owner-only act. The way back is SSH, an .env edit and the seeder,
 * which for a shop owner on a Friday evening means the panel is gone until
 * somebody technical is free. Every method that could remove the last one
 * refuses; see refuse() and AdminUser::isLastStaffManager().
 *
 * PASSWORDS ARE GENERATED, SHOWN ONCE, NEVER READABLE AGAIN
 * --------------------------------------------------------
 * store() and resetPassword() are the only two places a plaintext credential
 * exists, and in both it lives exactly as long as one response body. Nothing
 * stores it, so nothing can hand it back — a forgotten password is a reset,
 * not a lookup. See store() for why the server picks it rather than the owner.
 */
class AdminStaffController extends Controller
{
    /**
     * GET /api/admin/staff
     *
     * Everyone, in one response, unpaginated. A shop has five to twenty staff
     * accounts; paginating twelve rows adds a control that never moves and a
     * second request to discover it was not needed.
     *
     * The role catalogue rides along in `meta`, so the create form's dropdown
     * is built from what the server actually accepts. A copy of the role list
     * in the JavaScript is a copy that drifts, and the way you find out is a
     * 422 on a role the form itself offered.
     */
    public function index(Request $request): JsonResponse
    {
        $me    = $request->user('admin');
        $staff = AdminUser::query()->get();

        /* Counted once, here, rather than asking isLastStaffManager() per row —
           that method runs a query, and twenty rows would be twenty queries to
           answer a question with one number in it. The write paths still call
           it, because there they ask about a single row and the answer has to
           be current as of that write rather than as of a list drawn earlier. */
        $activeManagers = $staff
            ->filter(fn (AdminUser $u): bool => $u->is_active && $u->may('staff.manage'))
            ->count();

        /* Sorted in PHP by the order roles appear in AdminUser::ROLES, which is
           deliberately most-powerful-first: an owner opening this screen should
           see who holds the keys before they see anything else. In SQL this is
           ORDER BY FIELD or a CASE ladder — one more dialect-specific fragment,
           for a list that never fills a page. */
        $rank = array_flip(AdminUser::ROLES);

        $rows = $staff
            ->sortBy(fn (AdminUser $u): array => [$rank[$u->role] ?? 99, mb_strtolower($u->name)])
            ->values()
            ->map(fn (AdminUser $u): array => $u->toStaffArray() + [
                // A fact about the REQUEST, not about the row, which is why it
                // is composed here and not in the model.
                'isSelf'     => $u->id === $me->id,
                'lockedRole' => $this->roleLockReason($u, $me, $activeManagers),
            ]);

        return response()->json([
            'data' => $rows,
            /* The trail rides along with the list rather than sitting behind
               its own endpoint. It is read every single time this screen is
               opened and never on its own, so a second request would be a
               second round trip to render one page.

               Forty, newest first. A shop makes a handful of these a year, so
               forty is "all of it" in practice — and the screen says forty
               rather than implying it is everything, because a cap that lies
               about being complete is worse than no cap. */
            'events' => AdminUserEvent::query()
                // id as the tiebreaker: one save can write both a role change
                // and a details change in the same second, and without it the
                // two come back in whichever order the driver felt like.
                ->latest('created_at')->latest('id')
                ->limit(40)
                ->get()
                ->map(fn (AdminUserEvent $e): array => $e->toAdminArray()),
            'meta' => [
                'total'       => $staff->count(),
                'activeCount' => $staff->where('is_active', true)->count(),
                // Renamed from ownerCount: what the screen has to warn about
                // is the number of people who can still hand out access.
                'managerCount' => $activeManagers,
                'roles'       => AdminUser::roleCatalogue(),
                /* The permission catalogue, so the grid on the staff screen is
                   drawn from what the server actually enforces. Areas in the
                   order they are declared, each with only the actions that area
                   genuinely has — there is no `dashboard.delete` to explain
                   away, because the server does not have one either. */
                'areas' => array_map(static fn (string $area): array => [
                    'key'     => $area,
                    'label'   => AdminUser::AREA_LABELS[$area] ?? $area,
                    'actions' => array_map(static fn (string $action): array => [
                        'key'        => $action,
                        'label'      => AdminUser::ACTION_LABELS[$action] ?? $action,
                        'permission' => "{$area}.{$action}",
                    ], AdminUser::PERMISSIONS[$area]),
                ], array_keys(AdminUser::PERMISSIONS)),
            ],
        ]);
    }

    /**
     * POST /api/admin/staff
     *
     * Creates the account and generates its password, which is returned ONCE
     * in this response and never again. Nothing stores the plaintext, so no
     * endpoint can read it back.
     *
     * WHY THE SERVER PICKS THE PASSWORD
     * ---------------------------------
     * The alternative is a password box on the form, and a password box on a
     * form gets the shop's name and a year. This is the rule AdminUserSeeder
     * already applies to the very first owner — generate it, show it once — so
     * the only route to a weak staff credential in this shop is the owner of
     * that credential deliberately choosing one later.
     *
     * The plaintext is in the response body, which is what "shown once" costs
     * without a mail dependency: same-origin, over TLS in production, and
     * never to be written to a log. It is named `password` rather than
     * something coy precisely so nobody mistakes it for a token worth keeping.
     */
    public function store(StaffStoreRequest $request): JsonResponse
    {
        $password = Str::password(20);

        $staff = AdminUser::create([
            'name'      => $request->string('name')->toString(),
            'email'     => $request->string('email')->toString(),
            'role'      => $request->string('role')->toString(),
            // Plaintext in, hash stored: the model's `hashed` cast does it on
            // set. Passing Hash::make() here would also work — the cast lets an
            // already-hashed value through — but one file doing it two ways is
            // how somebody eventually double-hashes a password and spends an
            // afternoon working out why a correct one is refused.
            'password'  => $password,
            // Absent from the request means null means "follow the role".
            'permissions' => $request->validated()['permissions'] ?? null,
            'is_active' => true,
        ]);

        AdminUserEvent::record($staff, AdminUserEvent::CREATED, $request->user('admin'),
            to: $staff->role);

        return response()->json([
            'data'     => $staff->toStaffArray() + ['isSelf' => false, 'lockedRole' => null],
            'password' => $password,
            'message'  => "{$staff->name} can now sign in as " . AdminUser::labelFor($staff->role)
                . '. Hand over the password below — it is not stored anywhere and cannot be '
                . 'shown a second time.',
        ], 201);
    }

    /**
     * PATCH /api/admin/staff/{staff}
     *
     * Name, email and role. Not the password (that is a reset — it returns a
     * credential, and no ordinary save should be in that business) and not
     * `is_active` (that is disable/enable, which carries its own refusals and
     * must not ride along in a form that mostly fixes typos).
     */
    public function update(StaffUpdateRequest $request, AdminUser $staff): JsonResponse
    {
        $me   = $request->user('admin');
        $data = $request->validated();

        $changesAccess = array_key_exists('role', $data) || array_key_exists('permissions', $data);

        /* Asked again here, even though index() already told the client which
           rows are locked and why. That answer went to a browser — a place
           where rules are displayed, not a place where they are kept. */
        if ($changesAccess && $staff->id === $me->id) {
            return $this->refuse(
                'You cannot change your own access. Ask another owner to do it — somebody '
                . 'who takes away their own permissions by accident has no way to undo it.'
            );
        }

        /* One guard for two ways of causing the same disaster.
           Demoting the last person who can manage staff and un-ticking
           `staff.manage` on them are the same act with different UI, and a
           guard that only knew about roles would have caught one and waved the
           other through — leaving a panel nobody can appoint anybody from.

           Asked of a COPY carrying the proposed change rather than by
           reasoning about what the change implies. The rules for what a
           permission list resolves to already live in one place; re-deriving
           them here is how the two answers drift apart. */
        if ($changesAccess && $staff->isLastStaffManager()) {
            $after = clone $staff;
            $after->fill($data);

            if (! $after->may('staff.manage')) {
                return $this->refuse(
                    "{$staff->name} is the only active account that can manage staff. This "
                    . 'change would leave nobody able to open this screen, and no way to fix '
                    . 'it from inside the panel. Give somebody else staff access first.'
                );
            }
        }

        $wasRole  = $staff->role;
        $wasPerms = count($staff->expandedPermissions());
        $wasCustom = $staff->hasCustomPermissions();
        $wasEmail = $staff->email;
        $staff->fill($data)->save();

        /* wasChanged(), not a comparison against the request: a PATCH that
           sends the values already on the row is an ordinary thing for a form
           to do, and recording "changed from Manager to Manager" would fill the
           trail with events that never happened. */
        if ($staff->wasChanged('role')) {
            AdminUserEvent::record($staff, AdminUserEvent::ROLE_CHANGED,
                $me, $wasRole, $staff->role);
        }

        if ($staff->wasChanged('name') || $staff->wasChanged('email')) {
            AdminUserEvent::record($staff, AdminUserEvent::DETAILS_CHANGED,
                $me, $wasEmail, $staff->email);
        }

        /* wasChanged('permissions') is not reliable for a json column — Laravel
           compares the encoded strings, so a list with the same members in a
           different order reads as a change. Comparing the resolved sets is the
           question actually being asked: did what this person may do move? */
        $nowCustom = $staff->hasCustomPermissions();
        $nowPerms  = count($staff->expandedPermissions());

        if ($nowCustom !== $wasCustom || $nowPerms !== $wasPerms) {
            AdminUserEvent::record($staff, AdminUserEvent::PERMISSIONS_SET, $me,
                (string) $wasPerms,
                $nowCustom ? (string) $nowPerms : null);
        }

        /* Said in terms of what actually changed. "Saved." after a promotion is
           technically true and tells the owner nothing about the one thing they
           hesitated over before clicking. */
        $message = $staff->role !== $wasRole
            ? "{$staff->name} is now " . AdminUser::labelFor($staff->role)
                . '. It applies to the next screen they open — the session guard reads their '
                . 'role fresh on every request, so they do not have to sign in again.'
            : "{$staff->name}'s details saved.";

        return response()->json([
            'data' => $staff->toStaffArray() + [
                'isSelf'     => $staff->id === $me->id,
                'lockedRole' => $this->roleLockReason($staff, $me, null),
            ],
            'message' => $message,
        ]);
    }

    /**
     * POST /api/admin/staff/{staff}/password
     *
     * A fresh generated password, shown once, exactly as store() does it. This
     * is the forgotten-password path: on a panel with five accounts that is an
     * owner and a colleague standing in the same shop, not a reset email with
     * a token to expire and an SMTP server to keep alive.
     *
     * It also clears any lockout. Somebody who has just tripped the five-
     * failure lock BY not remembering their password is exactly who this is
     * for, and handing them a new password they then cannot use for fifteen
     * minutes would be a joke at their expense.
     */
    public function resetPassword(Request $request, AdminUser $staff): JsonResponse
    {
        $password = Str::password(20);

        $staff->forceFill([
            'password'        => $password,   // hashed by the cast; see store()
            'failed_attempts' => 0,
            'locked_until'    => null,
        ])->save();

        AdminUserEvent::record($staff, AdminUserEvent::PASSWORD_RESET, $request->user('admin'));

        return response()->json([
            'data'     => $staff->toStaffArray(),
            'password' => $password,
            'message'  => "New password for {$staff->name}. Their old one stopped working just "
                . 'now, and this is the only time this one is shown.',
        ]);
    }

    /**
     * POST /api/admin/staff/{staff}/unlock
     *
     * Clears the lock without touching the password — for the ordinary case
     * where somebody mistyped a password they do know, five times, and is now
     * locked out of a shift they are standing in the middle of. The
     * alternative is waiting fifteen minutes, and a rule that stops staff
     * working is a rule staff route around by sharing one login.
     */
    public function unlock(Request $request, AdminUser $staff): JsonResponse
    {
        if (! $staff->isLocked()) {
            return response()->json([
                'message' => "{$staff->name}'s account is not locked — they can sign in now.",
            ], 422);
        }

        $staff->forceFill(['failed_attempts' => 0, 'locked_until' => null])->save();

        AdminUserEvent::record($staff, AdminUserEvent::UNLOCKED, $request->user('admin'));

        return response()->json([
            'data'    => $staff->toStaffArray(),
            'message' => "{$staff->name} can sign in again.",
        ]);
    }

    /**
     * POST /api/admin/staff/{staff}/disable
     *
     * The panel's version of removing somebody — see the class docblock for
     * why there is no delete. Takes effect immediately, including on a session
     * they already have open: RequireAdmin checks `is_active` on every single
     * request rather than once at sign-in, so a disabled account's next click
     * is a 401 and the login screen.
     */
    public function disable(Request $request, AdminUser $staff): JsonResponse
    {
        $me = $request->user('admin');

        if (! $staff->is_active) {
            return response()->json([
                'message' => "{$staff->name}'s account is already disabled.",
            ], 422);
        }

        if ($staff->id === $me->id) {
            return $this->refuse(
                'You cannot disable your own account. You would be signed out on your next '
                . 'click, with nobody left in this browser who could switch it back on.'
            );
        }

        if ($staff->isLastStaffManager()) {
            return $this->refuse(
                "{$staff->name} is the only active account that can manage staff. Disabling "
                . 'them would leave this panel with nobody able to appoint anyone, and no way '
                . 'to fix it from inside. Give somebody else staff access first.'
            );
        }

        $staff->forceFill(['is_active' => false])->save();

        AdminUserEvent::record($staff, AdminUserEvent::DISABLED, $me);

        return response()->json([
            'data'    => $staff->toStaffArray() + ['isSelf' => false, 'lockedRole' => null],
            'message' => "{$staff->name} can no longer sign in. Everything they did stays on "
                . 'record with their name on it, and you can switch them back on any time.',
        ]);
    }

    /**
     * POST /api/admin/staff/{staff}/enable
     *
     * Also clears any lockout on the way back in. A lock left over from
     * whatever happened before the account was disabled is not a fact about
     * today, and greeting somebody's first shift back with "account locked"
     * would be a puzzle with no clue attached.
     *
     * It deliberately does NOT reset the password: they may well remember it,
     * and issuing a new one that has to be handed over makes returning from
     * two weeks' leave harder than it needs to be. Reset it separately if they
     * have forgotten.
     */
    public function enable(Request $request, AdminUser $staff): JsonResponse
    {
        if ($staff->is_active) {
            return response()->json([
                'message' => "{$staff->name}'s account is already active.",
            ], 422);
        }

        $staff->forceFill([
            'is_active'       => true,
            'failed_attempts' => 0,
            'locked_until'    => null,
        ])->save();

        $me = $request->user('admin');
        AdminUserEvent::record($staff, AdminUserEvent::ENABLED, $me);

        return response()->json([
            'data' => $staff->toStaffArray() + [
                'isSelf'     => $staff->id === $me->id,
                'lockedRole' => $this->roleLockReason($staff, $me, null),
            ],
            'message' => "{$staff->name} can sign in again as "
                . AdminUser::labelFor($staff->role) . '.',
        ]);
    }

    /* ---- Shared refusals ------------------------------------------------ */

    /**
     * Why this row's role cannot be changed, or null if it can.
     *
     * The same two questions update() asks, answered for the whole list at
     * once so the client can disable a dropdown WITH ITS REASON VISIBLE rather
     * than leave a control mysteriously missing. A control that vanishes
     * teaches nobody anything; one that says "this is the only owner" teaches
     * the rule once and is never asked about again.
     *
     * @param int|null $activeManagers pre-counted, where the caller has a whole
     *   list to answer for; null asks the database about this row alone.
     */
    private function roleLockReason(AdminUser $row, AdminUser $me, ?int $activeManagers): ?string
    {
        if ($row->id === $me->id) {
            return 'You cannot change your own access — ask another owner.';
        }

        /* Counted by ABILITY rather than by role, because the two came apart
           the moment permissions became per-account: an owner can be handed a
           list without `staff.manage`, and a manager can be handed one with it.
           Counting owners would guard the wrong thing in both directions. */
        $isLastManager = $activeManagers === null
            ? $row->isLastStaffManager()
            : ($row->is_active && $row->may('staff.manage') && $activeManagers === 1);

        return $isLastManager
            ? 'The only account that can manage staff. Give somebody else staff access first.'
            : null;
    }

    /**
     * 422, not 403.
     *
     * A 403 says "you are not allowed to do this", which is untrue here — an
     * owner IS allowed to change roles and disable accounts; that is the whole
     * point of the screen. What has been refused is this particular move,
     * because of the state it would leave the panel in. That is a rule
     * violation, the same shape as an illegal order transition, and it is
     * reported the same way.
     */
    private function refuse(string $message): JsonResponse
    {
        return response()->json(['message' => $message], 422);
    }
}
