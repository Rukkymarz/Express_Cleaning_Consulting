<?php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Spatie\Permission\Middleware\PermissionMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [EnsureFrontendRequestsAreStateful::class]);
        $middleware->preventRequestForgery(except: ['api/v1/requests', 'api/v1/quotes/preview', 'api/v1/public-intakes']);
        $middleware->alias(['permission' => PermissionMiddleware::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {})
    ->create();
