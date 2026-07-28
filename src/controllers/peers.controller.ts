import type { FastifyReply, FastifyRequest } from "fastify";
import { createPeerRequestSchema, publicKeyParamSchema } from "../types/peer";

export async function listPeers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const peers = await request.server.peerService.listPeers();
  reply.status(200).send(peers);
}

export async function getPeer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { publicKey } = publicKeyParamSchema.parse(request.params);
  const peer = await request.server.peerService.getPeer(publicKey);
  reply.status(200).send(peer);
}

export async function createPeer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createPeerRequestSchema.parse(request.body ?? {});
  const result = await request.server.peerService.createPeer(body);
  reply.status(201).send(result);
}

export async function deletePeer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { publicKey } = publicKeyParamSchema.parse(request.params);
  await request.server.peerService.deletePeer(publicKey);
  reply.status(204).send();
}
