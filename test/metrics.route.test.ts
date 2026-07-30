import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("GET /metrics", () => {
it("returns 401 without an Authorization header", async () => {
  const app = buildServer();

  const res = await app.inject({
    method: "GET",
    url: "/metrics",
  });

  expect(res.statusCode).toBe(401);
});
it("returns 200 with the correct API key", async () => {
  const app = buildServer();

  const res = await app.inject({
    method: "GET",
    url: "/metrics",
    headers: {
      authorization: `Bearer ${process.env.API_KEY}`,
    },
  });

  expect(res.statusCode).toBe(200);
  expect(res.body).toContain("wg_agent_http_requests_total");
  expect(res.headers["content-type"]).toContain("text/plain");
});
});
