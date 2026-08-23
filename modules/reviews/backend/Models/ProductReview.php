<?php

declare(strict_types=1);

namespace Modules\Reviews\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Admin\Models\AdminUser;
use Modules\Catalog\Models\Product;
use Modules\Checkout\Models\Order;

/**
 * One customer's review of one product.
 *
 * @property int         $id
 * @property int         $product_id
 * @property int|null    $user_id
 * @property int|null    $order_id
 * @property string      $author_name
 * @property int         $rating
 * @property string|null $title
 * @property string      $body
 * @property string      $status
 */
class ProductReview extends Model
{
    public const PENDING = 'pending';
    public const PUBLISHED = 'published';
    public const REJECTED = 'rejected';

    protected $fillable = [
        'product_id', 'user_id', 'order_id', 'author_name',
        'rating', 'title', 'body', 'status', 'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'rating'       => 'integer',
            'verified_at'  => 'datetime',
            'moderated_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function moderator(): BelongsTo
    {
        return $this->belongsTo(AdminUser::class, 'moderated_by');
    }

    /** The order that proved the purchase. See the migration. */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** The only reviews a shopper may ever see. */
    public function scopePublished(Builder $q): Builder
    {
        return $q->where('status', self::PUBLISHED);
    }

    /**
     * What a shopper is shown.
     *
     * No email, no user id, no order number. The author is a snapshot taken at
     * submission — see the migration — and the verified flag is derived from
     * whether the purchase check passed, not from anything the reviewer said.
     *
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id'       => $this->id,
            'author'   => $this->author_name,
            'rating'   => $this->rating,
            'title'    => $this->title,
            'body'     => $this->body,
            'verified' => $this->verified_at !== null,
            'date'     => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * What the merchant is shown in the queue.
     *
     * Carries the product so the moderation screen can say what is being
     * reviewed without a request per row, and the order number so a suspicious
     * review can be traced to the purchase that justified it.
     *
     * @return array<string, mixed>
     */
    public function toPanelArray(): array
    {
        return [
            'id'          => $this->id,
            'status'      => $this->status,
            'author'      => $this->author_name,
            'rating'      => $this->rating,
            'title'       => $this->title,
            'body'        => $this->body,
            'verified'    => $this->verified_at !== null,
            'submitted'   => $this->created_at?->toIso8601String(),
            'moderatedAt' => $this->moderated_at?->toIso8601String(),
            'product'     => [
                'sku'   => $this->product?->sku,
                'title' => $this->product?->title,
                'image' => $this->product?->image,
            ],
            'orderNumber' => $this->order?->order_number,
        ];
    }
}
