<?php

declare(strict_types=1);

namespace Modules\Courier\Contracts;

use Modules\Courier\Models\Consignment;
use Modules\Courier\Models\Courier;

/**
 * What every carrier integration must be able to do.
 *
 * Deliberately small. Four verbs cover what a storefront actually needs from a
 * courier, and a wider interface would mean every new adapter implementing
 * methods for features one carrier has and the rest do not.
 *
 * Adapters are written against THIS, never against the admin screens, so
 * adding Pathao later touches one new file and one seeder row — not the order
 * pages, not the consignment table, not the UI.
 */
interface CourierDriver
{
    /** Machine key, matching `couriers.driver`. */
    public function key(): string;

    /**
     * Can this driver actually reach the courier right now?
     *
     * Separate from "is the courier switched on". The manual driver is always
     * ready; an API driver is only ready once credentials exist. The panel uses
     * this to explain WHY a courier cannot be picked, rather than hiding it.
     */
    public function isReady(Courier $courier): bool;

    /**
     * Hand a parcel over and get back the carrier's identifiers.
     *
     * @return array{trackingNumber:?string, consignmentRef:?string, costPoisha:?int}
     * @throws \RuntimeException when the courier refuses or is unreachable —
     *   the caller turns that into a 422 so a staff member can pick another
     *   carrier rather than seeing a server error.
     */
    public function book(Consignment $consignment): array;

    /**
     * Latest scan events, newest last.
     *
     * @return array<int, array{status:string, description:?string, location:?string, externalId:?string, occurredAt:\DateTimeInterface}>
     */
    public function track(Consignment $consignment): array;

    /** Best-effort cancellation. Returns false when the courier will not. */
    public function cancel(Consignment $consignment): bool;
}
