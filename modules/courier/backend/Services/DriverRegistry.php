<?php

declare(strict_types=1);

namespace Modules\Courier\Services;

use Modules\Courier\Contracts\CourierDriver;
use Modules\Courier\Drivers\ManualDriver;
use Modules\Courier\Models\Courier;

/**
 * Maps a courier row's `driver` string to the class that implements it.
 *
 * Unknown drivers fall back to manual rather than throwing. A courier row
 * naming an adapter that has not been written yet — which is the normal state
 * for Pathao, Steadfast and the rest until credentials exist — must still be
 * usable by hand. Failing hard there would mean a data row could take the
 * orders screen down.
 */
final class DriverRegistry
{
    /** @var array<string, CourierDriver> */
    private array $drivers = [];

    public function __construct()
    {
        $this->register(new ManualDriver());
        // Real adapters register here as they are written:
        //   $this->register(new PathaoDriver($http));
    }

    public function register(CourierDriver $driver): void
    {
        $this->drivers[$driver->key()] = $driver;
    }

    public function for(Courier $courier): CourierDriver
    {
        return $this->drivers[$courier->driver] ?? $this->drivers['manual'];
    }

    /** True when the row names an adapter that actually exists. */
    public function hasDriver(string $key): bool
    {
        return isset($this->drivers[$key]);
    }
}
