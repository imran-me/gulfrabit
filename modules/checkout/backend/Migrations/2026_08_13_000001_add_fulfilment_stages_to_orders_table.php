<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two stages the shop actually works, added to the order status enum.
 *
 * WHY THE ORIGINAL SEVEN WERE NOT ENOUGH
 * --------------------------------------
 * `packed → shipped` hid a real, physical wait. A parcel that is sealed and
 * labelled is not with a courier: it is on the bench by the door, and somebody
 * has to hand it over. That gap is where parcels are lost — nobody can answer
 * "what is waiting for the rider today?" if the answer requires remembering.
 * `ready_for_courier` makes it a queue you can see and count.
 *
 * `spam` is the other admission. In a COD market a share of orders are not
 * orders: a wrong number, a bored child, a competitor. Marking those
 * `cancelled` poisons the one number a merchant most needs to trust — the
 * cancellation rate, which is supposed to measure orders that were real and
 * went wrong. Junk gets its own drawer so the real figures stay honest.
 *
 * ADDITIVE ONLY
 * -------------
 * No existing row changes value and no existing value is removed, so this runs
 * against live data with nothing to backfill. `down()` is written to refuse
 * rather than silently rewrite orders that are legitimately in a new stage —
 * see the note there.
 */
return new class extends Migration
{
    /**
     * The enum, in full. MySQL has no "add a value" for enums; the column is
     * redeclared, so the complete list has to be stated in one place.
     */
    private const STATUSES = [
        'placed', 'confirmed', 'packed', 'ready_for_courier',
        'shipped', 'delivered', 'cancelled', 'returned', 'spam',
    ];

    private const STATUSES_BEFORE = [
        'placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned',
    ];

    public function up(): void
    {
        $this->setEnum(self::STATUSES);
    }

    public function down(): void
    {
        // Orders sitting in a stage this rollback is about to delete would be
        // silently coerced by MySQL — to '' on a loose server, or to a random
        // neighbour. An order whose status quietly becomes wrong is worse than
        // a migration that will not run, so this stops and says what to do.
        $stranded = DB::table('orders')
            ->whereIn('status', ['ready_for_courier', 'spam'])
            ->count();

        if ($stranded > 0) {
            throw new RuntimeException(
                "{$stranded} order(s) are in the ready_for_courier or spam stage. "
                . 'Move them to another status before rolling this back.'
            );
        }

        $this->setEnum(self::STATUSES_BEFORE);
    }

    /**
     * @param  array<int, string>  $statuses
     */
    private function setEnum(array $statuses): void
    {
        $list = implode(', ', array_map(
            fn (string $s): string => "'" . $s . "'",
            $statuses,
        ));

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE orders MODIFY status ENUM({$list}) NOT NULL DEFAULT 'placed'");

            return;
        }

        // SQLite — the test database — has no enum type. Laravel emitted the
        // original column as TEXT plus a CHECK constraint naming the seven
        // statuses of the day, and that constraint would reject the two new
        // ones. There is no "alter a check constraint" in SQLite, so the column
        // becomes a plain string and the whitelist in OrderFulfilmentService
        // does the enforcing, which is where it is enforced for every caller
        // anyway. MySQL, the deployment target, keeps the real enum above.
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('status', 32)->default('placed')->change();
        });
    }
};
