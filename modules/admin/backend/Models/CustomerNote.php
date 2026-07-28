<?php

declare(strict_types=1);

namespace Modules\Admin\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A staff note about a customer. Internal only — never returned by any
 * storefront endpoint, and deleted outright when a customer is erased, because
 * an opinion about a person has no subject once the person is gone.
 */
class CustomerNote extends Model
{
    protected $fillable = ['user_id', 'body', 'author_admin_id', 'author_name'];

    public function toAdminArray(): array
    {
        return [
            'id'     => $this->id,
            'body'   => $this->body,
            'author' => $this->author_name,
            'at'     => $this->created_at?->toIso8601String(),
        ];
    }
}
