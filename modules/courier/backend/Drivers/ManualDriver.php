<?php

declare(strict_types=1);

namespace Modules\Courier\Drivers;

use Modules\Courier\Contracts\CourierDriver;
use Modules\Courier\Models\Consignment;
use Modules\Courier\Models\Courier;

/**
 * The driver that works today, with no credentials and no integration.
 *
 * This is not a stub or a placeholder. Most Bangladeshi merchants run exactly
 * this way: someone phones the courier or hands parcels to a rider, writes the
 * tracking number on a slip, and types it in. Making that a first-class driver
 * rather than a gap means the whole consignment/event/cost pipeline is real and
 * in use from day one — so when a Pathao adapter is written it slots into a
 * system that has been working, instead of switching one on for the first time.
 *
 * It books nothing and fetches nothing. Staff supply the tracking number, and
 * staff record each status change; those land in consignment_events with
 * `source = 'staff'`, so the trail is honest about who knew what.
 */
final class ManualDriver implements CourierDriver
{
    public function key(): string
    {
        return 'manual';
    }

    /** Always. A human with a phone is a working integration. */
    public function isReady(Courier $courier): bool
    {
        return true;
    }

    /**
     * No call is made. The tracking number is whatever staff typed when they
     * assigned the courier — returned unchanged so the caller's flow is
     * identical to an API driver's.
     */
    public function book(Consignment $consignment): array
    {
        return [
            'trackingNumber' => $consignment->tracking_number,
            'consignmentRef' => null,
            'costPoisha'     => $consignment->cost_poisha,
        ];
    }

    /**
     * Nothing to poll. Returning an empty list rather than throwing matters:
     * the sync job runs over every consignment, and a manual one must be a
     * no-op, not an error that stops the batch.
     */
    public function track(Consignment $consignment): array
    {
        return [];
    }

    /** Cancelling is a phone call, so the system cannot claim to have done it. */
    public function cancel(Consignment $consignment): bool
    {
        return false;
    }
}
