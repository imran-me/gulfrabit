<?php

declare(strict_types=1);

namespace Modules\Admin\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Admin\Models\AdminUser;

/**
 * Editing a staff account: their name, their email, their role.
 *
 * Not their password — that is a reset, not an edit, and it lives on its own
 * route because it returns something (a new credential, once) that no ordinary
 * save should ever be in the business of handing back.
 *
 * Not `is_active` either. Disabling somebody is its own act with its own
 * consequences and its own refusals, and a boolean riding along in a form that
 * mostly fixes typos is how an account gets switched off by an unnoticed
 * checkbox.
 */
class StaffUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // `admin:staff` on the route is the control
    }

    public function rules(): array
    {
        return [
            'name'  => ['sometimes', 'string', 'min:2', 'max:120'],
            // ignore() on the row being edited, or saving a form without
            // touching the email field would report the account's own address
            // as taken — by itself.
            'email' => [
                'sometimes', 'email:rfc', 'max:191',
                Rule::unique('admin_users', 'email')->ignore($this->route('staff')),
            ],
            'role'  => ['sometimes', Rule::in(AdminUser::ROLES)],
            // nullable is meaningful: null RESETS the account to follow its
            // role again, which is the only way back out of a custom list.
            'permissions'   => ['sometimes', 'nullable', 'array'],
            'permissions.*' => ['string', Rule::in(AdminUser::allPermissions())],
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'Another staff account already uses that email.',
            'role.in'          => 'That is not a role this panel has.',
            'permissions.*.in' => 'That is not a permission this panel has.',
        ];
    }
}
