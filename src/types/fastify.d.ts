import type { PeerService } from "../services/peer.service";
import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    peerService: PeerService;
  }
  interface FastifyRequest {
    startTime?: bigint;
  }
}
