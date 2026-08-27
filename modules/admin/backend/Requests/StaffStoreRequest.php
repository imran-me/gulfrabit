<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Admin\Models\AdminUser;

/**
 * Creating a staff account.
 *
 * NOTE WHAT IS NOT HERE: a password field.
 *
 * The server generates one and returns it once — see AdminStaffController::
 * store — so there is no request shape by which a weak staff password can be
 * typed into this shop at all. A `password` key sent by a curious client is
 * not rejected, it is simply never read; validation that merely forbade it
 * would be one more rule to maintain for a field nothing consumes.
 */
class StaffStoreRequest extends FormRequest
{
    /**
     * The route's `admin:staff` middleware is the control, and only `owner`
     * holds that capability. Returning true here is not a hole — a request
     * that reaches this class has already been through it.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'  => ['required', 'string', 'min:2', 'max:120'],
            // `email:rfc` and not `email:rfc,dns`. A DNS lookup on every staff
            // creation adds a network round trip to a form used twice a year,
            // and fails closed on a shop whose server cannot resolve — which
            // would present as "that address is invalid" for a perfectly good
            // company address.
            'email' => ['required', 'email:rfc', 'max:191', Rule::unique('admin_users', 'email')],
            'role'  => ['required', Rule::in(AdminUser::ROLES)],
            // Optional at creation. Left out, the account simply follows the
            // role it was given, which is what most accounts want forever.
            // nullable is meaningful: null RESETS the account to follow its
            // role again, which is the only way back out of a custom list.
            'permissions'   => ['sometimes', 'nullable', 'array'],
            'permissions.*' => ['string', Rule::in(AdminUser::allPermissions())],
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'A staff account already uses that email. If they left and have '
                . 'come back, re-enable the existing account rather than making a second one — '
                . 'their history stays attached to it.',
            'role.in'         => 'That is not a role this panel has.',
            'permissions.*.in' => 'That is not a permission this panel has.',
        ];
    }

    public function attributes(): array
    {
        return ['name' => 'their name', 'email' => 'their email', 'role' => 'the role'];
    }
}
