import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("GET /ready", () => {
  it("returns 401 without an Authorization header", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 200 with the correct API key", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/ready",
      headers: {
        authorization: `Bearer ${process.env.API_KEY}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ready",
    });

    await app.close();
  });
});
