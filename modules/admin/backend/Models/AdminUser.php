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

    protected $fillable = ['name', 'email', 'password', 'role', 'permissions', 'is_active'];

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
            // null stays null — see the 2026_08_27 migration for why that is
            // a different fact from an empty list.
            'permissions'     => 'array',
            'is_active'       => 'boolean',
            'last_login_at'   => 'datetime',
            'locked_until'    => 'datetime',
            'failed_attempts' => 'integer',
        ];
    }

    /* ---- Roles and permissions -----------------------------------------

       A role is a PRESET, not a cage. It fills in a sensible set of
       permissions; an owner may then tick or untick individual ones for one
       person, and that account's own list is stored on its row.

       The original design was one role per user and no matrix at all, on the
       argument that a matrix nobody maintains drifts until everyone is an
       owner. That risk is real and this does not pretend otherwise — but
       "give this person the orders screen and nothing else" is an ordinary
       thing for a shop to want, and five fixed roles cannot say it. The
       compromise is that the matrix is opt-in: an account nobody has
       customised follows its role exactly, and most never need more. */

    public const ROLES = ['owner', 'manager', 'warehouse', 'accounts', 'editor'];

    /**
     * Every permission this panel knows about, by area.
     *
     * THE ACTIONS ARE PER-AREA, NOT A GRID
     * ------------------------------------
     * A blanket area × action grid would invent `dashboard.delete` and
     * `inventory.refund` — permissions for acts that do not exist, which then
     * have to be explained away in the UI. Each area lists only what can
     * genuinely be done in it, so every checkbox on the staff screen maps to a
     * real thing the server checks.
     *
     * `view` is the one every area has, and it is what a bare `admin:<area>`
     * on a route resolves to — so every route written before permissions
     * existed keeps working, unchanged.
     *
     * @var array<string, array<int, string>>
     */
    public const PERMISSIONS = [
        'dashboard'  => ['view'],
        // `cancel` covers cancelled, returned and spam together: all three end
        // an order rather than advancing it, and they were already one group in
        // OrderFulfilmentService::RESTRICTED_TO_MANAGEMENT.
        'orders'     => ['view', 'edit', 'cancel', 'refund', 'delete'],
        // `erase` anonymises and is irreversible; `delete` merely takes them
        // off the list. Two acts, never synonyms — see AdminCustomerController.
        'customers'  => ['view', 'edit', 'erase', 'delete'],
        // `archive` is its own permission rather than part of edit: putting the
        // season away is routine catalogue work, and a shop may well want
        // somebody who can do it without being able to change a price.
        'products'   => ['view', 'edit', 'archive', 'delete'],
        'inventory'  => ['view', 'edit'],
        'accounting' => ['view', 'edit'],
        'content'    => ['view', 'edit', 'delete'],
        // `manage` rather than edit/delete: staff accounts are never deleted,
        // and creating one, changing a role and disabling somebody are all the
        // same decision — you trust a person with the keys or you do not.
        'staff'      => ['view', 'manage'],
        'settings'   => ['view', 'edit'],
    ];

    /**
     * What each area is called on screen, in the merchant's words rather than
     * the code's. `products` is not "products" to the person ticking the box —
     * it is the whole catalogue, coupons and images included.
     *
     * @var array<string, string>
     */
    public const AREA_LABELS = [
        'dashboard'  => 'Dashboard',
        'orders'     => 'Orders, couriers, campaigns and quotes',
        'customers'  => 'Customers',
        'products'   => 'Catalogue — products, categories, coupons, images, reviews',
        'inventory'  => 'Stock',
        'accounting' => 'Books — profit & loss and the journal',
        'content'    => 'Website content and appearance',
        'staff'      => 'Staff accounts',
        'settings'   => 'Settings',
    ];

    /**
     * What each action means, said as what the person can do rather than as the
     * verb the code happens to use.
     *
     * @var array<string, string>
     */
    public const ACTION_LABELS = [
        'view'    => 'Open and read',
        'edit'    => 'Add and change',
        'archive' => 'Archive and restore',
        'cancel'  => 'Cancel, return or mark as spam',
        'refund'  => 'Authorise refunds',
        'erase'   => 'Erase permanently',
        'delete'  => 'Delete',
        'manage'  => 'Create accounts and set permissions',
    ];

    /**
     * The permissions each role hands out.
     *
     * These reproduce exactly what the five roles could do before per-account
     * permissions existed. That is the point of a preset: nothing changed on
     * the day this shipped.
     *
     * `owner` is '*' rather than a list. It used to be spelled out, so that
     * reading the table told you the whole truth — but the table now has thirty
     * entries and would need a new one added to owner every time an area gains
     * an action. A wildcard cannot be forgotten, and "an owner can do
     * everything" is the one rule here that will never want an exception.
     *
     * @var array<string, array<int, string>>
     */
    public const ROLE_PERMISSIONS = [
        'owner' => ['*'],

        'manager' => [
            'dashboard.view',
            'orders.view', 'orders.edit', 'orders.cancel', 'orders.refund',
            'customers.view', 'customers.edit',
            'products.view', 'products.edit', 'products.archive',
            'inventory.view', 'inventory.edit',
            'accounting.view', 'accounting.edit',
            'content.view', 'content.edit',
        ],

        // The shop floor. Moves parcels and stock; no money, no customer
        // records, and cannot end an order — see the `cancel` note above.
        'warehouse' => [
            'dashboard.view',
            'orders.view', 'orders.edit',
            'inventory.view', 'inventory.edit',
        ],

        // Note `orders.edit` and `orders.cancel`: this role could already work
        // orders as fully as a manager, because only warehouse was ever
        // restricted. Preserved rather than tightened — narrowing it here would
        // be a behaviour change smuggled in under a refactor.
        'accounts' => [
            'dashboard.view',
            'accounting.view', 'accounting.edit',
            'orders.view', 'orders.edit', 'orders.cancel', 'orders.refund',
        ],

        'editor' => [
            'dashboard.view',
            'content.view', 'content.edit',
        ],
    ];

    /**
     * Every permission string this panel knows, flattened.
     *
     * @return array<int, string>
     */
    public static function allPermissions(): array
    {
        $out = [];

        foreach (self::PERMISSIONS as $area => $actions) {
            foreach ($actions as $action) {
                $out[] = "{$area}.{$action}";
            }
        }

        return $out;
    }

    /** Is `orders.delete` a permission this panel actually has? */
    public static function isKnownPermission(string $permission): bool
    {
        return in_array($permission, self::allPermissions(), true);
    }

    /**
     * What a ROLE would grant, without needing an account to ask it of.
     *
     * The staff screen needs this to show what picking a preset would do,
     * before anything is saved to anybody.
     */
    public static function roleMay(string $role, string $permission): bool
    {
        $held = self::ROLE_PERMISSIONS[$role] ?? [];

        return in_array('*', $held, true) || in_array($permission, $held, true);
    }

    /**
     * The permissions actually in force for this account.
     *
     * A stored list wins outright; null means "follow the role", which is what
     * every account created before this feature carries and what any account
     * nobody has customised keeps. Null and an empty array are different facts
     * — see the 2026_08_27 migration.
     *
     * @return array<int, string>
     */
    public function effectivePermissions(): array
    {
        if ($this->permissions !== null) {
            return $this->permissions;
        }

        return self::ROLE_PERMISSIONS[$this->role] ?? [];
    }

    /**
     * The same list with the owner's wildcard spelled out, for anything that
     * has to SHOW permissions rather than test one — a checkbox grid cannot
     * tick '*'.
     *
     * Ordered by allPermissions() rather than by whatever order the stored
     * array happens to be in, so the grid does not reshuffle after a save.
     *
     * @return array<int, string>
     */
    public function expandedPermissions(): array
    {
        $held = $this->effectivePermissions();

        return in_array('*', $held, true)
            ? self::allPermissions()
            : array_values(array_intersect(self::allPermissions(), $held));
    }

    /** Has this account been given a list of its own, rather than its role's? */
    public function hasCustomPermissions(): bool
    {
        return $this->permissions !== null;
    }

    /**
     * May this staff member do one specific thing?
     *
     * The whole authority, and the only question the middleware and the
     * controllers ask. Named `may` rather than `can` for the same reason
     * canAccess() is not `can`: Laravel's Authorizable trait already owns
     * `can()`, and redeclaring it with a narrower signature is a fatal error at
     * class-load time — which is how that was found the first time.
     */
    public function may(string $permission): bool
    {
        $held = $this->effectivePermissions();

        return in_array('*', $held, true) || in_array($permission, $held, true);
    }

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
            'capabilities' => array_values(array_filter(
                array_keys(self::PERMISSIONS),
                fn (string $area): bool => self::roleMay($role, "{$area}.view"),
            )),
            'permissions'  => (self::ROLE_PERMISSIONS[$role] ?? []) === ['*']
                ? self::allPermissions()
                : (self::ROLE_PERMISSIONS[$role] ?? []),
        ], self::ROLES);
    }

    /**
     * The areas this account may OPEN.
     *
     * Derived from the permission list rather than stored beside it. Two lists
     * that have to agree is one list that eventually will not — and this one
     * feeds the sidebar, so the failure mode is a nav item that 403s when it is
     * clicked.
     *
     * @return array<int, string>
     */
    public function capabilities(): array
    {
        return array_values(array_filter(
            array_keys(self::PERMISSIONS),
            fn (string $area): bool => $this->may("{$area}.view"),
        ));
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
        return $this->may("{$area}.view");
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
     * Is this the only active account that could still manage staff?
     *
     * THIS USED TO ASK ABOUT THE OWNER ROLE, AND THAT STOPPED BEING THE
     * QUESTION
     * --------------------------------------------------------------------
     * When capabilities came only from roles, "the last active owner" and "the
     * last person who can manage staff" were the same sentence. Per-account
     * permissions pulled them apart: an owner can now be handed a list without
     * `staff.manage` in it, and a manager can be handed one with it.
     *
     * Counting owners would then guard the wrong thing in both directions — it
     * would refuse to demote an owner who could not manage staff anyway, and it
     * would happily disable the one manager who could, leaving a panel nobody
     * can appoint anybody from. So it asks about the ABILITY, which is what
     * actually has to survive.
     *
     * Resolved in PHP rather than SQL because the answer lives in a nullable
     * JSON column with a role fallback behind it, and a query that tried to
     * express that would be a WHERE clause nobody could read. This panel holds
     * five to twenty accounts.
     */
    public function isLastStaffManager(): bool
    {
        if (! $this->is_active || ! $this->may('staff.manage')) {
            return false;
        }

        return ! self::query()
            ->where('is_active', true)
            ->whereKeyNot($this->getKey())
            ->get()
            ->contains(fn (self $other): bool => $other->may('staff.manage'));
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
            // The expanded list, so the client never has to know what '*'
            // means. An owner arrives with all thirty spelled out.
            'permissions'  => $this->expandedPermissions(),
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
            'permissions' => $this->expandedPermissions(),
            // Whether the role still describes this account, or whether
            // somebody has ticked boxes and the role is now only a label.
            'isCustom'    => $this->hasCustomPermissions(),
        ];
    }
}
