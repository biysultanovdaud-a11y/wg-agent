import type { FastifyInstance } from "fastify";
import { getMetrics } from "../controllers/metrics.controller";
import { requireApiKey } from "../middleware/auth";

// eslint-disable-next-line @typescript-eslint/require-await
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/metrics", { onRequest: requireApiKey }, getMetrics);
}
