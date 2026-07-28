import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { UnauthorizedError } from "../utils/errors";

const BEARER_PREFIX = "Bearer ";

/** Constant-time comparison — a naive `===` would let response timing leak how many leading characters of the API key an attacker guessed correctly. */
function isValidApiKey(candidate: string): boolean {
  const expected = Buffer.from(env.API_KEY);
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length) {
    // timingSafeEqual throws on length mismatch rather than returning false —
    // comparing against itself keeps this branch constant-time too, instead
    // of short-circuiting in a way whose timing depends on candidate.length.
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(expected, actual);
}

/**
 * Applied to every route, including /health, per the spec's "every
 * request must require Authorization" — deliberately not carving out an
 * exception for health checks. The operational cost: a Docker
 * HEALTHCHECK or load balancer probe needs the API key too, which is a
 * real tradeoff against the usual "leave health checks open" convention.
 * Documented in the README rather than silently choosing the more
 * conventional but less literal reading of the spec.
 *
 * Must stay `async` even though nothing inside awaits: Fastify's onRequest
 * hooks use the callback's declared arity to decide how to know it's
 * finished. A 2-parameter hook (request, reply) is expected to return a
 * Promise; a plain synchronous 2-param function gives Fastify nothing to
 * await and the request hangs forever on any path that doesn't throw
 * (verified — a non-async version here passed every 401 test, since a
 * thrown error short-circuits regardless, and hung indefinitely on the
 * one 200 path, where the hook has to actually signal completion).
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function requireApiKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError("Missing or malformed Authorization header — expected 'Bearer <API_KEY>'");
  }

  const candidate = header.slice(BEARER_PREFIX.length);
  if (!isValidApiKey(candidate)) {
    throw new UnauthorizedError("Invalid API key");
  }
}
