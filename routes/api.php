<?php

declare(strict_types=1);

/**
 * Intentionally empty.
 *
 * Every API route belongs to a module and is registered by that module's
 * service provider from inside modules/<feature>/backend/routes.php. Adding a
 * route here would break the rule that deleting a module folder removes its
 * endpoints — so if you are about to add one, it belongs in a module instead.
 *
 * This file exists only so bootstrap/app.php can enable the 'api' middleware
 * group that the module routes attach to.
 */
