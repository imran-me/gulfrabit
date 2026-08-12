<?php

declare(strict_types=1);

namespace Modules\Hero\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How the hero moves. One row, guaranteed by the migration.
 */
class HeroSetting extends Model
{
    protected $table = 'hero_settings';

    protected $fillable = [
        'interval_ms', 'transition', 'transition_ms', 'easing',
        'ken_burns', 'autoplay', 'updated_by_name',
    ];

    protected function casts(): array
    {
        return [
            'interval_ms'   => 'integer',
            'transition_ms' => 'integer',
            'ken_burns'     => 'boolean',
            'autoplay'      => 'boolean',
        ];
    }

    /**
     * The row, or a defaulted instance that has never been saved.
     *
     * The migration seeds the row, so the fallback is for one case only: code
     * running against a database where this module's migration has not been
     * applied yet. Returning defaults there means a deploy that lands ahead of
     * its migration shows a working carousel at the built-in speed instead of a
     * 500 on the home page — the same rule the order screen follows.
     */
    public static function current(): self
    {
        return static::query()->first() ?? new self([
            'interval_ms'   => 6000,
            'transition'    => 'fade',
            'transition_ms' => 600,
            'easing'        => 'ease-in-out',
            'ken_burns'     => false,
            'autoplay'      => true,
        ]);
    }

    /** @return array<string, mixed> */
    public function toPublicArray(): array
    {
        return [
            'intervalMs'    => $this->interval_ms,
            'transition'    => $this->transition,
            'transitionMs'  => $this->transition_ms,
            'easing'        => $this->easing,
            'kenBurns'      => $this->ken_burns,
            'autoplay'      => $this->autoplay,
        ];
    }
}
