<?php

declare(strict_types=1);

namespace Modules\Catalog\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\StockAlert;

/**
 * Telling the people who asked to be told.
 *
 * The other half of the Notify me button. Collecting the interest was the easy
 * part and worth nothing on its own: a list nobody ever sends to is the same
 * as the disabled button it replaced, only with a database table behind it.
 *
 * DELIBERATELY NOT AUTOMATIC
 * --------------------------
 * The obvious design is to text everyone the moment `available_from` passes or
 * `in_stock` flips back on. It is the wrong one, twice over:
 *
 *   · A shipment "arriving on the 14th" arrives when it arrives. Firing on the
 *     date would text forty people to come and buy something still sitting in
 *     customs, and the second message — the apology — is the one they
 *     remember.
 *   · Stock flips on and off for reasons that are not restocks: a recount, a
 *     correction, a mis-keyed switch. Each of those would be a text message to
 *     everyone waiting, and there is no unsend.
 *
 * So a human presses the button, on the morning the boxes are actually on the
 * floor. It is one click on the screen they are already looking at.
 */
class AdminStockAlertController extends Controller
{
    /** How many go out in one request, so a slow gateway cannot time the page out. */
    private const BATCH = 200;

    /**
     * POST /api/admin/products/{sku}/notify-waiting
     *
     * Sends to everyone still waiting on this product and stamps them, so a
     * second press does not text the same people twice.
     */
    public function send(Request $request, string $sku): JsonResponse
    {
        $product = Product::query()->withTrashed()->where('sku', $sku)->firstOrFail();

        // The check that stops the worst version of this. Texting people to
        // come and buy something they still cannot buy is worse than not
        // texting them at all — they arrive, they find the same Notify me
        // button, and they stop believing the next message.
        if (! $product->isOrderable()) {
            return response()->json([
                'message' => $product->isUpcoming()
                    ? 'This has not arrived yet. Clear its arrival date, or switch pre-orders on, before telling anyone.'
                    : 'This is still out of stock. Switch it back in stock first.',
            ], 422);
        }

        $sms = $this->gateway();

        if ($sms === null) {
            return response()->json([
                'message' => 'No SMS gateway is configured, so nothing was sent. '
                    . 'The waiting list is unchanged and can be sent later.',
            ], 422);
        }

        $waiting = StockAlert::query()
            ->where('product_id', $product->id)
            ->waiting()
            ->limit(self::BATCH)
            ->get();

        if ($waiting->isEmpty()) {
            return response()->json(['message' => 'Nobody is waiting for this one.'], 422);
        }

        $body = $this->message($product);
        $admin = $request->user('admin');
        $sent = 0;

        foreach ($waiting as $alert) {
            // `kind` is 'manual' and the staff name rides along, because this
            // is somebody's decision and the sms log is an audit trail. A
            // hundred messages that nobody appears to have authorised is the
            // shape of a compromised panel, not a restock.
            $ok = $sms->send($alert->phone, $body, null, $admin?->name, 'manual');

            if ($ok) {
                // Stamped one at a time rather than in one UPDATE at the end.
                // A gateway that dies half way through must not leave everyone
                // marked as told — the survivors of that are people who never
                // hear anything and cannot be found again.
                $alert->notified_at = now();
                $alert->save();
                $sent += 1;
            }
        }

        $left = StockAlert::query()->where('product_id', $product->id)->waiting()->count();

        if ($sent < $waiting->count()) {
            Log::warning('[stock-alerts] some messages were refused', [
                'sku' => $sku, 'attempted' => $waiting->count(), 'sent' => $sent,
            ]);
        }

        return response()->json([
            'data'    => ['sent' => $sent, 'waiting' => $left],
            'message' => $this->summary($sent, $waiting->count(), $left),
        ]);
    }

    /**
     * The message itself.
     *
     * Short, because it is one SMS segment and a second segment is a second
     * charge on every recipient. Names the product, says it is available, and
     * stops — no link, because a URL in a Bangladeshi SMS is as likely to be
     * read as a scam as followed.
     */
    private function message(Product $product): string
    {
        return "GulfRabit: {$product->title} is back in stock. "
            . 'Order now while it lasts. You asked us to let you know.';
    }

    private function summary(int $sent, int $attempted, int $left): string
    {
        if ($sent === 0) {
            return 'Nothing sent — the gateway refused every message. Nobody has been marked as told.';
        }

        $line = $sent === 1 ? '1 person told.' : "{$sent} people told.";

        if ($sent < $attempted) {
            $line .= ' ' . ($attempted - $sent) . ' could not be reached and are still on the list.';
        }

        if ($left > 0) {
            $line .= " {$left} still waiting — press again to send the next batch.";
        }

        return $line;
    }

    /**
     * The SMS service, or null when modules/sms is not installed.
     *
     * The same courtesy the dashboard extends to every optional module: ask,
     * and do without rather than fataling. Deleting modules/sms/ must leave a
     * shop that still sells things.
     */
    private function gateway(): ?object
    {
        $class = 'Modules\Sms\Services\SmsService';

        if (! class_exists($class)) {
            return null;
        }

        $service = app($class);

        return $service->configured() ? $service : null;
    }
}
