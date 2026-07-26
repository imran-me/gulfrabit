<?php

declare(strict_types=1);

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A catalog category. Self-referencing, so sub-categories are rows with a parent.
 *
 * @property string $slug
 * @property string $name
 * @property string $audience 'retail' | 'b2b'
 */
class Category extends Model
{
    use HasFactory;

    protected $fillable = [
        'slug', 'name', 'icon', 'image', 'blurb',
        'audience', 'parent_id', 'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active'  => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }

    /** Only the top level — the mega-menu and the home grid both want this. */
    public function scopeTopLevel(Builder $q): Builder
    {
        return $q->whereNull('parent_id');
    }

    public function scopeForAudience(Builder $q, string $audience): Builder
    {
        return $q->where('audience', $audience);
    }

    public function toStorefrontArray(): array
    {
        return [
            'slug'     => $this->slug,
            'name'     => $this->name,
            'icon'     => $this->icon,
            'image'    => $this->image,
            'blurb'    => $this->blurb,
            'audience' => $this->audience,
        ];
    }
}
