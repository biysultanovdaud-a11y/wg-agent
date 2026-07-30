import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { PeerService } from "../src/services/peer.service";
import { WireGuardConfigRepository } from "../src/repositories/wireguard-config.repository";
import type { WireGuardService } from "../src/services/wireguard.service";
import { ConflictError, NotFoundError } from "../src/utils/errors";
import { metrics } from "../src/metrics/registry";

/**
 * A stand-in for WireGuardService that never shells out to a real `wg`
 * binary — this environment has none installed. Deterministic, inspectable
 * key generation lets these tests assert on exact values instead of just
 * "some string came back," while still exercising PeerService's real
 * orchestration logic (IP allocation, config read/write, rollback).
 */
function fakeWireGuard(overrides: Partial<WireGuardService> = {}): WireGuardService {
  let counter = 0;
  // Deliberately independent of the private key's literal text (not e.g.
  // `PUB-of-${privateKey}`) — a public key that contains its private key
  // as a substring would make "the private key is never written to disk"
  // untestable, since the (legitimately written) public key would trip
  // that assertion by coincidence rather than the code under test doing
  // anything wrong.
  const publicKeyByPrivateKey = new Map<string, string>();

  return {
    generatePrivateKey: vi.fn(() => {
      const privateKey = `FAKE-PRIVATE-${++counter}`;
      publicKeyByPrivateKey.set(privateKey, `FAKE-PUBLIC-${counter}`);
      return Promise.resolve(privateKey);
    }),
    derivePublicKey: vi.fn((privateKey: string) => {
      const publicKey = publicKeyByPrivateKey.get(privateKey) ?? `FAKE-PUBLIC-unknown-${privateKey}`;
      return Promise.resolve(publicKey);
    }),
    generatePresharedKey: vi.fn(() => Promise.resolve("FAKE-PSK")),
    validateConfigFile: vi.fn(() => Promise.resolve(undefined)),
    reload: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

const INTERFACE_BLOCK = "[Interface]\nPrivateKey = SERVER-PRIVATE-KEY\nAddress = 10.8.0.1/24\nListenPort = 51820";

let configPath: string;
let dir: string;

async function seedConfig(peerLines = ""): Promise<void> {
  await writeFile(configPath, `${INTERFACE_BLOCK}\n${peerLines}`, "utf8");
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wg-agent-peer-test-"));
  configPath = path.join(dir, "wg0.conf");
  await seedConfig();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// PeerService only ever calls .error on its logger — a minimal stub is
// enough, cast through unknown since it doesn't implement Pino's full
// FastifyBaseLogger surface (child, level, etc.), which nothing here needs.
const silentLogger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;
async function getMetricValue(metric: { get: () => Promise<{ values: Array<{ value: number }> }> }): Promise<number> {
  const result = await metric.get();
  return result.values[0]?.value ?? 0;
}

describe("PeerService.createPeer", () => {
  it("generates a keypair, allocates the first free IP, writes it to disk, and returns a full result", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    const result = await service.createPeer({});
    
    expect(await getMetricValue(metrics.peerCreations)).toBeGreaterThan(0);

    expect(result.ip).toBe("10.8.0.2");
    expect(result.publicKey).toBe("FAKE-PUBLIC-1");
    expect(result.privateKey).toBe("FAKE-PRIVATE-1");
    expect(result.presharedKey).toBe("FAKE-PSK");
    expect(result.config).toContain("PrivateKey = FAKE-PRIVATE-1");
    expect(result.config).toContain(`Endpoint = ${process.env.WG_ENDPOINT_HOST}`);

    const written = await readFile(configPath, "utf8");
    expect(written).toContain("PublicKey = FAKE-PUBLIC-1");
    expect(written).toContain("AllowedIPs = 10.8.0.2/32");
  });

  it("never writes the private key into wg0.conf — only the public key", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    const result = await service.createPeer({});
    const written = await readFile(configPath, "utf8");

    expect(written).not.toContain(result.privateKey);
  });

  it("allocates distinct IPs for successive peers, filling from .2 upward", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    const first = await service.createPeer({});
    const second = await service.createPeer({});

    expect(first.ip).toBe("10.8.0.2");
    expect(second.ip).toBe("10.8.0.3");
  });

  it("stores the optional label as a comment retrievable via listPeers", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    await service.createPeer({ label: "Alice's phone" });
    const peers = await service.listPeers();

    expect(peers[0]?.label).toBe("Alice's phone");
  });

  it("rolls back wg0.conf to its previous content if the reload fails", async () => {
    const before = await readFile(configPath, "utf8");
    const repo = new WireGuardConfigRepository(configPath);
    const failingReload = fakeWireGuard({
      reload: vi.fn(() => {
        throw new Error("wg syncconf failed: simulated");
      }),
    });
    const service = new PeerService(repo, failingReload, silentLogger);

    await expect(service.createPeer({})).rejects.toThrow("simulated");

    expect(await getMetricValue(metrics.reloadFailures)).toBeGreaterThan(0);

    // The whole point of the rollback contract: after a failed reload,
    // wg0.conf must read exactly as it did before the attempted change —
    // never left claiming a peer exists that the live interface doesn't have.
    const after = await readFile(configPath, "utf8");
    expect(after).toBe(before);
  });
});

describe("PeerService.deletePeer", () => {
  it("removes the peer from wg0.conf", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);
    const created = await service.createPeer({});

    await service.deletePeer(created.publicKey);

    expect(await getMetricValue(metrics.peerDeletions)).toBeGreaterThan(0);

    const peers = await service.listPeers();
    expect(peers.find((p) => p.publicKey === created.publicKey)).toBeUndefined();
  });

  it("throws NotFoundError for a public key that was never registered", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    await expect(service.deletePeer("NEVER-EXISTED")).rejects.toThrow(NotFoundError);
  });

  it("frees the deleted peer's IP for reuse by the next created peer", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);

    const first = await service.createPeer({});
    await service.deletePeer(first.publicKey);
    const second = await service.createPeer({});

    expect(second.ip).toBe(first.ip);
  });
});

describe("PeerService.getPeer / listPeers", () => {
  it("throws NotFoundError for an unknown public key", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);
    await expect(service.getPeer("UNKNOWN")).rejects.toThrow(NotFoundError);
  });

  it("lists all peers without exposing private keys (the summary type has no such field)", async () => {
    const repo = new WireGuardConfigRepository(configPath);
    const service = new PeerService(repo, fakeWireGuard(), silentLogger);
    await service.createPeer({});
    await service.createPeer({});

    const peers = await service.listPeers();
    expect(peers).toHaveLength(2);
    for (const peer of peers) {
      expect(Object.keys(peer)).not.toContain("privateKey");
    }
  });
});

describe("PeerService collision guard", () => {
  it("throws ConflictError if the freshly generated public key already exists as a peer", async () => {
    // Force the "random" key generator to be deterministic/repeating —
    // cryptographically this can't happen for real, but the guard exists
    // precisely so a broken RNG can never silently overwrite a peer.
    const repo = new WireGuardConfigRepository(configPath);
    const stuck = fakeWireGuard({
      generatePrivateKey: vi.fn(() => Promise.resolve("ALWAYS-THE-SAME")),
      derivePublicKey: vi.fn(() => Promise.resolve("ALWAYS-THE-SAME-PUBLIC")),
    });
    const service = new PeerService(repo, stuck, silentLogger);

    await service.createPeer({});
    await expect(service.createPeer({})).rejects.toThrow(ConflictError);
  });
});
