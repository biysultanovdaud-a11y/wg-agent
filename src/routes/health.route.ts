import type { FastifyInstance } from "fastify";
import { getHealth } from "../controllers/health.controller";
import { requireApiKey } from "../middleware/auth";

// Fastify's plugin/route-registration functions are conventionally async
// even when — as here — nothing inside actually awaits; that's the
// standard shape `app.register()` expects, not a mistake.
// eslint-disable-next-line @typescript-eslint/require-await
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // requireApiKey must stay async (see its own doc comment for why — a
  // real hang bug, verified, not just a style choice); Fastify's onRequest
  // hooks correctly support async functions, this lint rule just doesn't
  // model Fastify's own type overloads for it.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get("/health", { onRequest: requireApiKey }, getHealth);
}
