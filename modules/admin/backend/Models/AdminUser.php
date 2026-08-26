<?php

declare(strict_types=1);

namespace Modules\Admin\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * A staff account.
 *
 * @property string $name
 * @property string $email
 * @property string $role
 * @property bool   $is_active
 */
class AdminUser extends Authenticatable
{
    use Notifiable;

    protected $table = 'admin_users';

    protected $fillable = ['name', 'email', 'password', 'role', 'is_active'];

    /**
     * Never serialised, in any context. `$hidden` is a safety net rather than
     * the control — no admin endpoint returns a raw model — but the net is
     * cheap and the day someone adds `->toJson()` in a hurry it is the only
     * thing standing between a password hash and a response body.
     */
    protected $hidden = ['password', 'remember_token', 'failed_attempts', 'locked_until'];

    protected function casts(): array
    {
        return [
            'password'        => 'hashed',
            'is_active'       => 'boolean',
            'last_login_at'   => 'datetime',
            'locked_until'    => 'datetime',
            'failed_attempts' => 'integer',
        ];
    }

    /* ---- Roles ---------------------------------------------------------
       Capabilities are derived from one role rather than stored per user. A
       permission matrix nobody maintains drifts until everyone is an owner;
       this cannot drift, because changing what a role may do is a code change
       that gets reviewed. */

    public const ROLES = ['owner', 'manager', 'warehouse', 'accounts', 'editor'];

    /**
     * Which admin areas each role may open.
     *
     * `owner` is listed explicitly rather than special-cased to `*`, so that
     * reading this table tells you the whole truth about who sees what.
     *
     * @var array<string, array<int, string>>
     */
    public const CAPABILITIES = [
        // 'dashboard' is on every role: it is the panel's landing screen, and a
        // staff member who signs in and finds no page they may open has no way
        // to tell a permissions problem from a broken deployment. The dashboard
        // controller still decides which CARDS each role receives, so warehouse
        // lands somewhere real without being handed the day's revenue.
        'owner'     => ['dashboard', 'orders', 'customers', 'products', 'inventory', 'accounting', 'content', 'staff', 'settings'],
        'manager'   => ['dashboard', 'orders', 'customers', 'products', 'inventory', 'accounting', 'content'],
        // Fulfils orders and moves stock. No money, no customer records beyond
        // the delivery address printed on the packing slip.
        'warehouse' => ['dashboard', 'orders', 'inventory'],
        // The books and the reports. Cannot edit customers or the catalogue,
        // because the person who records a transaction should not also be able
        // to alter what it was for.
        'accounts'  => ['dashboard', 'accounting', 'orders'],
        // Website copy only. An editor never sees an order or a customer.
        'editor'    => ['dashboard', 'content'],
    ];

    /**
     * What each role is called on screen, and what it means in one sentence.
     *
     * Kept in this class, immediately under CAPABILITIES, because the two must
     * agree: a blurb that promises something the capability list does not grant
     * is a lie told at exactly the moment somebody is deciding what access to
     * hand a new employee. Changing one without the other should feel wrong,
     * and it does when they are eight lines apart.
     *
     * `warehouse` is labelled "Employee" deliberately. The role was named for
     * the job it was invented for, but it is the general shop-floor account —
     * the person who works orders and stock without touching money, customers
     * or the delete button — and "Warehouse" reads as a place this shop does
     * not have. The STORED value stays `warehouse`: renaming an enum member
     * that every existing row and a dozen permission checks refer to buys one
     * nicer word in the database and costs a migration nobody needed.
     *
     * @var array<string, array{label: string, blurb: string}>
     */
    public const ROLE_META = [
        'owner' => [
            'label' => 'Owner',
            'blurb' => 'The whole panel, including staff accounts and deleting records. '
                . 'Give this only to someone you would trust with the bank login.',
        ],
        'manager' => [
            'label' => 'Manager',
            'blurb' => 'Orders, customers, the catalogue and the books, and can authorise '
                . 'refunds. Cannot manage staff, and cannot delete anything.',
        ],
        'warehouse' => [
            'label' => 'Employee',
            'blurb' => 'Moves orders through the stages and manages stock. Cannot cancel an '
                . 'order, refund, delete or archive, and never sees customers or money.',
        ],
        'accounts' => [
            'label' => 'Accounts',
            'blurb' => 'The books, expenses and reports, plus the money side of orders. '
                . 'Cannot edit the catalogue or customer records.',
        ],
        'editor' => [
            'label' => 'Editor',
            'blurb' => 'Website copy, images and home-page content. Never sees an order or '
                . 'a customer.',
        ],
    ];

    /** The on-screen name for a role, falling back to the stored value. */
    public static function labelFor(string $role): string
    {
        return self::ROLE_META[$role]['label'] ?? ucfirst($role);
    }

    /**
     * The role catalogue, for any screen that offers a choice of role.
     *
     * Assembled from ROLES, ROLE_META and CAPABILITIES together, so a picker
     * cannot offer a role that grants nothing, or describe one in words the
     * capability list does not back up. The staff screen renders whatever this
     * returns and holds no list of its own — add a role here and the dropdown
     * has it, with its blurb and the areas it opens.
     *
     * @return array<int, array{value: string, label: string, blurb: string, capabilities: array<int, string>}>
     */
    public static function roleCatalogue(): array
    {
        return array_map(static fn (string $role): array => [
            'value'        => $role,
            'label'        => self::labelFor($role),
            'blurb'        => self::ROLE_META[$role]['blurb'] ?? '',
            'capabilities' => self::CAPABILITIES[$role] ?? [],
        ], self::ROLES);
    }

    /** @return array<int, string> */
    public function capabilities(): array
    {
        return self::CAPABILITIES[$this->role] ?? [];
    }

    /**
     * May this staff member open a given admin area?
     *
     * NOT named `can()`. Laravel's Authenticatable already has one, from the
     * Authorizable trait, with the signature `can($abilities, $arguments = [])`
     * — it routes to the Gate. Redeclaring it with a narrower signature is a
     * fatal PHP error the moment the class is loaded, which is exactly how this
     * was found: the seeder that creates the first admin account died on it.
     *
     * Renaming is also the honest fix rather than matching the parent's
     * signature. This asks about an area of the panel, not a Gate ability, and
     * two different questions sharing one method name is how the wrong one
     * eventually gets called.
     */
    public function canAccess(string $area): bool
    {
        return in_array($area, $this->capabilities(), true);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }

    /** Locked out by repeated failures? */
    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    /**
     * Is this the only active owner left?
     *
     * The question the staff screen must ask before every demotion and every
     * disable. A panel with no active owner cannot appoint one — the staff
     * screen is itself owner-only — so the way back is SSH, an .env edit and
     * the seeder, which for a shop owner on a Friday means the panel is simply
     * gone until somebody technical is free.
     *
     * Counted over ACTIVE owners, not all of them. A second owner who was
     * disabled last month cannot sign in to fix anything, so leaning on their
     * row to permit this demotion would be counting a door that is bricked up.
     */
    public function isLastActiveOwner(): bool
    {
        return $this->role === 'owner'
            && $this->is_active
            && self::query()
                ->where('role', 'owner')
                ->where('is_active', true)
                ->whereKeyNot($this->getKey())
                ->doesntExist();
    }

    /** The shape the admin client is allowed to see about itself. */
    public function toAdminArray(): array
    {
        return [
            'id'           => $this->id,
            'name'         => $this->name,
            'email'        => $this->email,
            'role'         => $this->role,
            'capabilities' => $this->capabilities(),
        ];
    }

    /**
     * The shape the staff screen shows about SOMEBODY ELSE.
     *
     * Deliberately not toAdminArray(). That one answers "who am I signed in
     * as" and is handed to every page in the panel; this one answers "who works
     * here" and carries the state of the account — disabled, locked out, last
     * seen, from where. Merging them would put a colleague's lockout status and
     * last IP into the payload every screen loads on boot, which is more than
     * any screen but this one has a reason to know.
     */
    public function toStaffArray(): array
    {
        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'email'       => $this->email,
            'role'        => $this->role,
            'roleLabel'   => self::labelFor($this->role),
            'isActive'    => $this->is_active,
            'isLocked'    => $this->isLocked(),
            'lockedUntil' => $this->locked_until?->toIso8601String(),
            'lastLoginAt' => $this->last_login_at?->toIso8601String(),
            // Shown so an owner can notice one account signing in from two
            // places — the usual sign that a login has been shared rather than
            // a second account created.
            'lastLoginIp' => $this->last_login_ip,
            'createdAt'   => $this->created_at?->toIso8601String(),
        ];
    }
}
