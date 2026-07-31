import { writeFile, mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GET /ready", () => {
  it("returns 401 without an Authorization header", async () => {
    const { buildServer } = await import("../src/server");
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("returns 200 with the correct API key", async () => {
    await mkdir("/tmp/wg-agent-test", { recursive: true });

    await writeFile("/tmp/wg-agent-test/wg0.conf", "[Interface]\nPrivateKey = test\nAddress = 10.8.0.1/24\n");

    process.env.WG_CONFIG_PATH = "/tmp/wg-agent-test/wg0.conf";

    const { buildServer } = await import("../src/server");
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
