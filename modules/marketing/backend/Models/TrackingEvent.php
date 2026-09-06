<?php

declare(strict_types=1);

namespace Modules\Marketing\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One funnel event, as the shop recorded it.
 *
 * Write-mostly: TrackController inserts, the dashboard reads and groups, and
 * nothing ever updates a row. An event is a fact about a moment - if it was
 * recorded wrongly the fix is a better recorder, not an edit.
 */
class TrackingEvent extends Model
{
    /**
     * The funnel, in the order a shopper meets it.
     *
     * The ORDER is the whole point: the dashboard walks this list and divides
     * each step by the one before it, so a step added in the wrong place would
     * silently report a drop-off that never happened. Anything outside this
     * list is still stored and still counted in the totals - it just is not a
     * funnel stage.
     */
    public const FUNNEL = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];

    protected $fillable = [
        'visitor_id', 'session_id', 'event_name', 'event_id',
        'value_poisha', 'currency', 'path', 'source_url', 'referrer',
        'content_ids', 'content_name', 'num_items',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'attribution',
        'capi_status',
    ];

    protected function casts(): array
    {
        return [
            'content_ids'  => 'array',
            'attribution'  => 'array',
            'value_poisha' => 'integer',
            'num_items'    => 'integer',
        ];
    }

    /**
     * Taka is presentation only, produced here and never stored.
     * Null stays null: an event that carries no money is not an event worth
     * nothing, and a report that shows one as 0.00 invites the reader to
     * average it in.
     */
    public function valueTaka(): ?float
    {
        return $this->value_poisha === null ? null : $this->value_poisha / 100;
    }

    /**
     * Events inside a window, newest first.
     *
     * Every screen on the dashboard starts here, which is why the window is a
     * scope rather than a where() copied into four controllers - one of those
     * four eventually disagrees about whether the boundary is inclusive.
     */
    public function scopeInWindow(Builder $q, int $days): Builder
    {
        return $q->where('created_at', '>=', now()->subDays($days));
    }
}
