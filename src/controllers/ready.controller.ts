import type { FastifyReply, FastifyRequest } from "fastify";
import { WireGuardConfigRepository } from "../repositories/wireguard-config.repository";
import { env } from "../config/env";

export interface ReadyResponse {
  status: "ready";
}

export async function getReady(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const repo = new WireGuardConfigRepository(env.WG_CONFIG_PATH);

    await repo.read();

    const body: ReadyResponse = {
      status: "ready",
    };

    reply.status(200).send(body);
  } catch {
    reply.status(503).send({
      status: "not_ready",
    });
  }
}
