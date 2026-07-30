import { readyRoutes } from "./routes/ready.route";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env";
import { registerErrorHandler } from "./plugins/error-handler";
import { healthRoutes } from "./routes/health.route";
import { metricsRoutes } from "./routes/metrics.route";
import { peerRoutes } from "./routes/peers.route";
import { WireGuardConfigRepository } from "./repositories/wireguard-config.repository";
import { WireGuardService } from "./services/wireguard.service";
import { PeerService } from "./services/peer.service";
import metricsPlugin from "./plugins/metrics";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Under exactOptionalPropertyTypes, an explicit `transport: undefined`
      // is a different (rejected) thing from the key being absent — spread
      // it in conditionally so the key simply doesn't exist outside dev.
      ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
      redact: ["req.headers.authorization"],
    },
    trustProxy: true,
  });

  const configRepo = new WireGuardConfigRepository(env.WG_CONFIG_PATH);
  const wireguardService = new WireGuardService();
  const peerService = new PeerService(configRepo, wireguardService, app.log);
  app.decorate("peerService", peerService);

  registerErrorHandler(app);

app.register(metricsPlugin);

app.register(healthRoutes);
app.register(metricsRoutes);
app.register(peerRoutes);
app.register(readyRoutes);

  return app;
}
