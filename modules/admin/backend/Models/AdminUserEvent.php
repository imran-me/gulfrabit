<?php

declare(strict_types=1);

namespace Modules\Admin\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One change to one staff account.
 *
 * Append-only: there is no update path and no delete route, like the order
 * timeline and the customer notes. A trail that can be tidied up after an
 * argument settles nothing.
 *
 * The writing is all done through record(), so no caller has to remember which
 * of the eight actions take a from/to pair and which are simply events.
 */
class AdminUserEvent extends Model
{
    protected $table = 'admin_user_events';

    protected $fillable = [
        'admin_user_id', 'subject_name', 'action',
        'from_value', 'to_value', 'actor_admin_id', 'actor_name',
    ];

    /* The eight things that can happen to a staff account. Named as past-tense
       facts rather than as the methods that cause them, because this is a
       record of what happened and not a log of which endpoint was called. */
    public const CREATED          = 'created';
    public const ROLE_CHANGED     = 'role_changed';
    public const DETAILS_CHANGED  = 'details_changed';
    public const DISABLED         = 'disabled';
    public const ENABLED          = 'enabled';
    public const PASSWORD_RESET   = 'password_reset';
    public const PASSWORD_CHANGED = 'password_changed';
    public const UNLOCKED         = 'unlocked';
    public const PERMISSIONS_SET  = 'permissions_set';

    /**
     * Write one event.
     *
     * The actor is passed rather than read from the request, because one caller
     * is not an owner acting on somebody else: changePassword() records a staff
     * member acting on themselves, and a helper that reached for `auth()` would
     * be right four times out of five and quietly wrong on the fifth.
     */
    public static function record(
        AdminUser $subject,
        string $action,
        AdminUser $actor,
        ?string $from = null,
        ?string $to = null,
    ): self {
        return self::create([
            'admin_user_id'  => $subject->id,
            // Denormalised, so the trail still reads after a rename. "Admin #7"
            // is not an answer anybody can act on six months later.
            'subject_name'   => $subject->name,
            'action'         => $action,
            'from_value'     => $from,
            'to_value'       => $to,
            'actor_admin_id' => $actor->id,
            'actor_name'     => $actor->name,
        ]);
    }

    /**
     * The event as one readable sentence, composed on the server.
     *
     * Here rather than in the JavaScript because the sentence depends on the
     * role LABELS — `warehouse` reads as "Employee" — and the client already
     * gets those from one place it does not own. Two copies of that mapping is
     * how the trail ends up saying somebody was made a Warehouse.
     */
    public function sentence(): string
    {
        /* Resolved into locals first. PHP's string interpolation cannot call a
           closure — a "{...}" holding $label($this->to_value) is a parse error,
           not a lazy label — and the complex-syntax rules accepting property
           access and method calls but NOT this is the kind of near-miss that
           reads fine and dies the first time the trail is opened. */
        $fromRole = $this->from_value === null ? '—' : AdminUser::labelFor($this->from_value);
        $toRole   = $this->to_value === null ? '—' : AdminUser::labelFor($this->to_value);

        return match ($this->action) {
            self::CREATED      => "created as {$toRole}",
            self::ROLE_CHANGED => "changed from {$fromRole} to {$toRole}",
            // Raw values here, not the role labels above: this action carries
            // an email either side, and labelFor() on an address would hand it
            // back with a capital letter and call that a role.
            self::DETAILS_CHANGED => $this->from_value === $this->to_value
                ? 'name updated'
                : "email changed from {$this->from_value} to {$this->to_value}",
            self::DISABLED         => 'disabled — can no longer sign in',
            self::ENABLED          => 'switched back on',
            self::PASSWORD_RESET   => 'password reset by an owner',
            self::PASSWORD_CHANGED => 'changed their own password',
            self::UNLOCKED         => 'unlocked after too many failed sign-ins',
            /* Counts, not the list. from_value and to_value are 255-character
               columns and twenty-five permission strings do not fit — and the
               list that matters is the one in force NOW, which is on the row
               this trail sits under. What the trail is for here is who changed
               it and when, and that is recorded in full. */
            self::PERMISSIONS_SET  => $this->to_value === null
                ? 'permissions reset to follow the role'
                : "permissions set by hand — {$this->from_value} of them before, {$this->to_value} now",
            // A row written by a version of the panel this one has not met.
            // Printing the raw action beats printing nothing, which would leave
            // a dated, attributed gap in the trail with no clue what it was.
            default                => $this->action,
        };
    }

    /** @return array<string, mixed> */
    public function toAdminArray(): array
    {
        return [
            'id'       => $this->id,
            'subject'  => $this->subject_name,
            'action'   => $this->action,
            'sentence' => $this->sentence(),
            'actor'    => $this->actor_name,
            // True where somebody acted on their own account, so the client can
            // say "changed their own password" rather than "Rahim by Rahim".
            'isSelf'   => $this->admin_user_id === $this->actor_admin_id,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
