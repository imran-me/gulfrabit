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
        'order_id', 'phone', 'body', 'gateway', 'sent_by_name', 'kind', 'status', 'response',
    ];

    /**
     * The message thread on the order screen.
     *
     * `status` rides along rather than being reduced to a tick, because "sent"
     * here means the gateway accepted it — not that a handset rang. The panel
     * says exactly that; a green tick that promised delivery would be a lie the
     * gateway never told us.
     *
     * The gateway's raw `response` is deliberately NOT exposed. It is diagnostic
     * text for the logs, and putting an API's error string on a screen staff use
     * while talking to a customer helps nobody.
     *
     * @return array<string, mixed>
     */
    public function toAdminArray(): array
    {
        return [
            'id'     => $this->id,
            'body'   => $this->body,
            'status' => $this->status,
            'kind'   => $this->kind,
            'sentBy' => $this->sent_by_name,
            'at'     => $this->created_at?->toIso8601String(),
        ];
    }
}
