<?php

declare(strict_types=1);

namespace Modules\Admin\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * "Forget this customer" — done by scrubbing, not deleting.
 *
 * WHY NOT DELETE
 * --------------
 * Deleting a customer row either orphans their orders or cascades and destroys
 * them. Both are wrong: an order is an accounting record, and a business is
 * required to keep the transaction for years after the person behind it has
 * asked to be forgotten. Those two obligations are not in conflict — the
 * transaction is not the person.
 *
 * So this keeps every figure and removes every identifier:
 *
 *   KEPT     order totals, dates, items, delivery charges, refunds, journal
 *            entries, the district (needed for delivery-cost analysis)
 *   SCRUBBED name, phone, email, password, addresses, and the contact details
 *            snapshotted onto each order at checkout
 *
 * The orders keep pointing at the same user row, so history, revenue and
 * repeat-purchase counts stay correct — the row simply no longer says who it
 * was.
 *
 * HOW LONG BEFORE THIS MAY BE USED is a policy decision, not a code one. There
 * is a legitimate reason to refuse: an order still in flight, or a tax
 * retention period that has not elapsed. This service enforces the first and
 * leaves the second to the owner (see modules/admin/README.md).
 */
final class CustomerAnonymiserService
{
    /**
     * @throws RuntimeException when the customer cannot be forgotten yet
     */
    public function anonymise(User $user, string $reason, int $adminId, string $adminName): void
    {
        if (trim($reason) === '') {
            throw new RuntimeException('A reason is required — this cannot be undone.');
        }

        // An order that is still moving needs a name and a phone number on it,
        // or nobody can deliver it. Refusing here is not bureaucracy; it is the
        // difference between forgetting someone and losing their parcel.
        $live = DB::table('orders')
            ->where('user_id', $user->id)
            ->whereNotIn('status', ['delivered', 'cancelled', 'returned'])
            ->exists();

        if ($live) {
            throw new RuntimeException(
                'This customer has an order still in progress. Complete or cancel it first.'
            );
        }

        DB::transaction(function () use ($user, $reason, $adminId, $adminName): void {
            $token = Str::lower(Str::random(8));

            // Phone and email are unique columns, so they cannot simply be
            // nulled to a shared placeholder across several forgotten
            // customers — each needs its own non-colliding stand-in.
            $user->forceFill([
                'name'              => 'Removed customer',
                'phone'             => "removed-{$token}",
                'email'             => null,
                'password'          => bcrypt(Str::random(40)),   // unusable, not blank
                'phone_verified_at' => null,
                'email_verified_at' => null,
                'remember_token'    => null,
            ])->save();

            // Addresses are pure PII with no accounting value.
            if (DB::getSchemaBuilder()->hasTable('addresses')) {
                DB::table('addresses')->where('user_id', $user->id)->delete();
            }

            // The contact details snapshotted onto each order at checkout are
            // the copy people forget. The district stays: it is a delivery
            // cost fact, not an identifier.
            DB::table('orders')->where('user_id', $user->id)->update([
                'customer_name'   => 'Removed customer',
                'customer_phone'  => '',
                'customer_email'  => null,
                'address_line'    => '[removed]',
                'area'            => null,
                'delivery_notes'  => null,
            ]);

            // Notes are staff opinions about a named person. Once the person is
            // gone the opinions have no subject and no business surviving.
            if (DB::getSchemaBuilder()->hasTable('customer_notes')) {
                DB::table('customer_notes')->where('user_id', $user->id)->delete();
            }

            // The erasure itself is recorded — without the identifiers. Proving
            // a request was honoured is the one thing that must outlive it.
            DB::table('customer_erasures')->insert([
                'user_id'          => $user->id,
                'reason'           => $reason,
                'performed_by_id'  => $adminId,
                'performed_by_name' => $adminName,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
        });
    }
}
