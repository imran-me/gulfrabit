<?php

declare(strict_types=1);

/**
 * The storefront is static HTML served from public/ — it does not route through
 * Laravel, so there are deliberately no page routes here.
 *
 * Laravel's job in this project is the JSON API under /api, which the modules
 * register themselves. See BACKEND.md.
 */
