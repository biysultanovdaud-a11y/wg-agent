import type { FastifyInstance } from "fastify";
import { createPeer, deletePeer, getPeer, listPeers } from "../controllers/peers.controller";
import { requireApiKey } from "../middleware/auth";

// See health.route.ts's comment on why this is async with no internal await.
// eslint-disable-next-line @typescript-eslint/require-await
export async function peerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", requireApiKey);

  app.post("/peers", createPeer);
  app.get("/peers", listPeers);
  app.get("/peers/:publicKey", getPeer);
  app.delete("/peers/:publicKey", deletePeer);
}
