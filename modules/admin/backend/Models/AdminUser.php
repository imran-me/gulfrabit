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

    /** @return array<int, string> */
    public function capabilities(): array
    {
        return self::CAPABILITIES[$this->role] ?? [];
    }

    public function can(string $area): bool
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
}
