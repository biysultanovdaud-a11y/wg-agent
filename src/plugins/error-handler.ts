import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, WireGuardCommandError } from "../utils/errors";

interface ErrorResponseBody {
  error: string;
  code: string;
  details?: unknown;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      const body: ErrorResponseBody = { error: error.message, code: error.code };
      reply.status(error.statusCode).send(body);
      return;
    }

    if (error instanceof ZodError) {
      const body: ErrorResponseBody = {
        error: "Request validation failed",
        code: "VALIDATION_ERROR",
        details: error.flatten(),
      };
      reply.status(400).send(body);
      return;
    }

    if (error instanceof WireGuardCommandError) {
      // Full command + stderr goes to the log for operators; the client
      // only gets a generic message — stderr from `wg`/`wg-quick` can
      // include local file paths and interface internals not meant for
      // whatever's on the other end of this API.
      request.log.error({ err: error, command: error.command, stderr: error.stderr }, "WireGuard command failed");
      const body: ErrorResponseBody = { error: "A WireGuard operation failed on this node", code: "WIREGUARD_ERROR" };
      reply.status(502).send(body);
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    const body: ErrorResponseBody = { error: "Internal server error", code: "INTERNAL_ERROR" };
    reply.status(500).send(body);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ error: `Route not found: ${request.method} ${request.url}`, code: "NOT_FOUND" });
  });
}
