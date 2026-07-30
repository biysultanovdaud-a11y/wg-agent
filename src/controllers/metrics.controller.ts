import type { FastifyReply, FastifyRequest } from "fastify";
import { registry } from "../metrics/registry";

export async function getMetrics(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.header("Content-Type", registry.contentType);
  reply.send(await registry.metrics());
}
