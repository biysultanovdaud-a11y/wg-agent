import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import type { HealthResponse } from "../src/controllers/health.controller";

interface ErrorResponseBody {
  error: string;
  code: string;
}

describe("GET /health", () => {
  it("returns 401 without an Authorization header", async () => {
    const app = buildServer();

    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 with the wrong API key", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health", headers: { authorization: "Bearer wrong-key" } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with the correct API key, matching the spec's response shape", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: `Bearer ${process.env.API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<HealthResponse>();
    expect(body.status).toBe("ok");
    expect(typeof body.hostname).toBe("string");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.version).toBe("string");
    await app.close();
  });

  it("rejects a malformed Authorization header (missing 'Bearer ' prefix)", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { authorization: process.env.API_KEY ?? "" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("unknown routes", () => {
  it("returns a structured 404", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/does-not-exist",
      headers: { authorization: `Bearer ${process.env.API_KEY}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorResponseBody>().code).toBe("NOT_FOUND");
    await app.close();
  });
});
