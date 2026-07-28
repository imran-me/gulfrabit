<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    protected $fillable = ['key', 'name', 'address', 'district', 'is_default', 'is_active'];

    protected $casts = ['is_default' => 'boolean', 'is_active' => 'boolean'];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function toAdminArray(): array
    {
        return [
            'key'       => $this->key,
            'name'      => $this->name,
            'district'  => $this->district,
            'isDefault' => $this->is_default,
            'isActive'  => $this->is_active,
        ];
    }
}
