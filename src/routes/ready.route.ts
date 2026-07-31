import type { FastifyInstance } from "fastify";
import { getReady } from "../controllers/ready.controller";
import { requireApiKey } from "../middleware/auth";

// eslint-disable-next-line @typescript-eslint/require-await
export async function readyRoutes(app: FastifyInstance): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/ready", { onRequest: requireApiKey }, getReady);
}
