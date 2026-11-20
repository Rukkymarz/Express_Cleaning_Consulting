import vinextWorker from "vinext/server/fetch-handler";

// Types come from vinext itself so CI typechecks without the locally
// generated .cloudflare/types (Env, ExportedHandler) that aren't committed.
type FetchArgs = Parameters<typeof vinextWorker.fetch>;

const canonicalHost = "www.expresscleaningconsult.com";

export default {
  async fetch(request: Request, env: FetchArgs[1], ctx: FetchArgs[2]): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "expresscleaningconsult.com") {
      url.hostname = canonicalHost;
      return Response.redirect(url.toString(), 308);
    }

    return vinextWorker.fetch(request, env, ctx);
  },
};
