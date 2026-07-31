import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("Peers routes", () => {
  it("returns 401 without API key", async () => {
    const app = buildServer();

    const res = await app.inject({
      method: "GET",
      url: "/peers",
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("creates, lists, gets and deletes a peer", async () => {
    const app = buildServer();

    const auth = {
      authorization: `Bearer ${process.env.API_KEY}`,
    };

    const create = await app.inject({
      method: "POST",
      url: "/peers",
      headers: auth,
      payload: {
        label: "integration-test",
      },
    });

    expect(create.statusCode).toBe(201);

    const created: {
      publicKey: string;
      privateKey: string;
      presharedKey: string;
      ip: string;
      config: string;
    } = create.json();

    expect(created.publicKey).toBeDefined();
    expect(created.privateKey).toBeDefined();
    expect(created.ip).toBeDefined();

    const list = await app.inject({
      method: "GET",
      url: "/peers",
      headers: auth,
    });

    expect(list.statusCode).toBe(200);

    const peers: Array<{
      publicKey: string;
      allowedIps: string;
      label?: string;
    }> = list.json();

    expect(peers.some((peer) => peer.publicKey === created.publicKey)).toBe(true);

    const get = await app.inject({
      method: "GET",
      url: `/peers/${encodeURIComponent(created.publicKey)}`,
      headers: auth,
    });

    expect(get.statusCode).toBe(200);

    const fetched: {
      publicKey: string;
      allowedIps: string;
      label?: string;
    } = get.json();

    expect(fetched.publicKey).toBe(created.publicKey);

    const remove = await app.inject({
      method: "DELETE",
      url: `/peers/${encodeURIComponent(created.publicKey)}`,
      headers: auth,
    });

    expect(remove.statusCode).toBe(204);

    await app.close();
  });
});
