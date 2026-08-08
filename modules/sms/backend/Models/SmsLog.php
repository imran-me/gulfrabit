<?php

declare(strict_types=1);

namespace Modules\Sms\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One SMS attempt — sent or failed, with the gateway's own answer.
 *
 * Prepaid SMS credit that runs out looks exactly like a working system from
 * the panel. This table is how "the customer says they got nothing" becomes a
 * checkable question instead of an argument.
 */
class SmsLog extends Model
{
    protected $fillable = [
        'order_id', 'phone', 'body', 'gateway', 'status', 'response',
    ];
}
