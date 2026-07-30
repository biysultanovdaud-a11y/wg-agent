import type { FastifyInstance } from "fastify";
import { getMetrics } from "../controllers/metrics.controller";
import { requireApiKey } from "../middleware/auth";

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/metrics", { onRequest: requireApiKey }, getMetrics);
}
