import fp from "fastify-plugin";
import type { FastifyPluginCallback } from "fastify";
import { metrics } from "../metrics/registry";

const metricsPlugin: FastifyPluginCallback = (app, _opts, done) => {

  app.addHook("onRequest",async (request) => {
    request.startTime = process.hrtime.bigint();
  });
  app.addHook("onResponse", async (request, reply) => {
    const start = request.startTime;

    if (start === undefined) {
      return;
    }

    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;

    const route =
      request.routeOptions.url ??
      request.routerPath ??
      request.url;

    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };

    metrics.httpRequests.inc(labels);
    metrics.httpRequestDuration.observe(labels, durationSeconds);
  });

  done();
};

export default fp(metricsPlugin, {
  name: "metrics",
});

