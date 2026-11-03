import vinextWorker from "vinext/server/fetch-handler";

const canonicalHost = "www.expresscleaningconsult.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === "expresscleaningconsult.com") {
      url.hostname = canonicalHost;
      return Response.redirect(url.toString(), 308);
    }

    return vinextWorker.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
