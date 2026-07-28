import type { PeerService } from "../services/peer.service";

declare module "fastify" {
  interface FastifyInstance {
    peerService: PeerService;
  }
}
