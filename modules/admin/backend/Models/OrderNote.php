<?php

declare(strict_types=1);

namespace Modules\Admin\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A staff note about one order. Internal only — no storefront endpoint returns
 * it, and it is never sent anywhere. Telling the customer something is a
 * different act with a different record (modules/sms), on purpose: the note
 * "customer sounded drunk, verify before packing" must be impossible to
 * accidentally deliver.
 */
class OrderNote extends Model
{
    protected $fillable = ['order_id', 'body', 'author_admin_id', 'author_name'];

    /** @return array<string, mixed> */
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
