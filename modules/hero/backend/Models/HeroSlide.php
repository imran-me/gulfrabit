<?php

declare(strict_types=1);

namespace Modules\Hero\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One banner on the home page.
 *
 * @property string      $image_path
 * @property string      $link_type
 * @property string|null $link_value
 */
class HeroSlide extends Model
{
    /* A banner is a headline, a sub-line, a button label, a link and an
       image somebody chose and cropped. Deleting used to lose all of it —
       the old dialog admitted as much. sort_order is left alone on the way
       out, so a restored banner returns to the place it held rather than to
       the end of the carousel. */
    use SoftDeletes;

    protected $fillable = [
        'image_path', 'alt', 'headline', 'subheadline',
        'link_type', 'link_value', 'sort_order', 'is_active',
        'starts_at', 'ends_at', 'updated_by_name',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at'   => 'datetime',
        ];
    }

    /**
     * The slides a customer should actually see, in the order set in the panel.
     *
     * The schedule is enforced HERE rather than in the panel, so a banner
     * cannot outlive its sale because the person who would have switched it off
     * was away that weekend. Null dates mean "always", which is why each check
     * is written as "no date, or the date has passed" rather than a BETWEEN.
     */
    public function scopeLive(Builder $query): Builder
    {
        $now = now();

        return $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /**
     * Where clicking this banner goes.
     *
     * Built here, at read time, from the type and the id — never stored. The
     * product URL scheme is about to change (?id= is on its way out), and a
     * stored href would freeze today's scheme into every banner ever created,
     * so the day it changes every banner in the shop quietly 404s. One method
     * to update instead of a migration over customer data.
     *
     * Returns null for a slide that is not a link, and the caller renders a
     * plain picture rather than an <a> that goes nowhere.
     */
    public function href(): ?string
    {
        return match ($this->link_type) {
            // The readable form Apache rewrites — /product/gr-1101 rather than
            // modules/catalog/product.html?id=gr-1101. Changed here, once, on
            // the day those URLs landed; not one banner in the database needed
            // touching, which is the entire reason the link is stored as a type
            // and an id instead of a finished href.
            'product'  => '/product/' . rawurlencode((string) $this->link_value),
            'category' => '/category/' . rawurlencode((string) $this->link_value),
            // Already validated to a same-site path on the way in — see
            // HeroSlideRequest. Passed through as stored.
            'custom'   => $this->link_value,
            default    => null,
        };
    }

    /** @return array<string, mixed> */
    public function toPublicArray(): array
    {
        return [
            'id'          => $this->id,
            'image'       => $this->image_path,
            'alt'         => $this->alt,
            'headline'    => $this->headline,
            'subheadline' => $this->subheadline,
            'href'        => $this->href(),
        ];
    }

    /**
     * The panel needs the raw link parts as well as the finished URL — it edits
     * the parts, and shows the URL so somebody can see where a banner actually
     * points without saving to find out.
     *
     * @return array<string, mixed>
     */
    public function toAdminArray(): array
    {
        return $this->toPublicArray() + [
            'linkType'  => $this->link_type,
            'linkValue' => $this->link_value,
            'sortOrder' => $this->sort_order,
            'isActive'  => $this->is_active,
            'startsAt'  => $this->starts_at?->toIso8601String(),
            'endsAt'    => $this->ends_at?->toIso8601String(),
            'updatedBy' => $this->updated_by_name,
            'updatedAt' => $this->updated_at?->toIso8601String(),
            // Null for a live banner. The admin list uses it to keep deleted
            // banners out of the running order and draw them separately.
            'deletedAt' => $this->deleted_at?->toIso8601String(),
        ];
    }
}
