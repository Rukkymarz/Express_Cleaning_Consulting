// Minimal Cloudflare Worker types so `npm run typecheck` passes in CI without generated Wrangler types.
// If Wrangler-generated types are added later (worker-configuration.d.ts), delete this file.
interface Env {
  ASSETS: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response>;
}
