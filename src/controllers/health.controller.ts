import { hostname } from "node:os";
import type { FastifyReply, FastifyRequest } from "fastify";
import packageJson from "../../package.json";

export interface HealthResponse {
  status: "ok";
  hostname: string;
  uptime: number;
  version: string;
}

export function getHealth(_request: FastifyRequest, reply: FastifyReply): void {
  const body: HealthResponse = {
    status: "ok",
    hostname: hostname(),
    uptime: process.uptime(),
    version: packageJson.version,
  };
  reply.status(200).send(body);
}
