import { describe, expect, it } from "vitest";
import {
  parseConfig,
  serializeConfig,
  extractInterfacePrivateKey,
} from "../src/repositories/wireguard-config.repository";

const SAMPLE_CONFIG = `[Interface]
PrivateKey = SERVERPRIVATEKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT

# label: Alice's laptop
[Peer]
PublicKey = PEER1PUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
PresharedKey = PEER1PSKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
AllowedIPs = 10.8.0.2/32

[Peer]
PublicKey = PEER2PUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
PresharedKey = PEER2PSKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
AllowedIPs = 10.8.0.3/32
`;

describe("parseConfig", () => {
  it("preserves the [Interface] block byte-for-byte (modulo trailing whitespace)", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    expect(parsed.interfaceBlock).toContain("PrivateKey = SERVERPRIVATEKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    expect(parsed.interfaceBlock).toContain("PostUp = iptables -A FORWARD -i wg0 -j ACCEPT");
    expect(parsed.interfaceBlock).not.toContain("[Peer]");
  });

  it("parses every peer block", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    expect(parsed.peers).toHaveLength(2);
    expect(parsed.peers[0]).toEqual({
      label: "Alice's laptop",
      publicKey: "PEER1PUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      presharedKey: "PEER1PSKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      allowedIps: "10.8.0.2/32",
    });
  });

  it("handles a peer with no label comment", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    expect(parsed.peers[1]?.label).toBeUndefined();
    expect(parsed.peers[1]?.publicKey).toBe("PEER2PUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  });

  it("drops a peer block missing a required field rather than returning a broken record", () => {
    const broken = `[Interface]\nPrivateKey = X\n\n[Peer]\nAllowedIPs = 10.8.0.2/32\n`;
    const parsed = parseConfig(broken);
    expect(parsed.peers).toHaveLength(0);
  });

  it("handles zero peers", () => {
    const parsed = parseConfig("[Interface]\nPrivateKey = X\nAddress = 10.8.0.1/24\n");
    expect(parsed.peers).toEqual([]);
  });
});

describe("serializeConfig / parseConfig round-trip", () => {
  it("produces a config that re-parses back to the same peer data", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    const serialized = serializeConfig(parsed);
    const reparsed = parseConfig(serialized);
    expect(reparsed.peers).toEqual(parsed.peers);
  });

  it("output always ends with a single trailing newline", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    const serialized = serializeConfig(parsed);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
  });

  it("omits the PresharedKey line entirely when a peer has none, rather than writing an empty value", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    parsed.peers = [
      { publicKey: "NOPSKKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", presharedKey: "", allowedIps: "10.8.0.9/32" },
    ];
    const serialized = serializeConfig(parsed);
    expect(serialized).not.toContain("PresharedKey");
  });
});

describe("extractInterfacePrivateKey", () => {
  it("pulls the server's private key out of the interface block", () => {
    const parsed = parseConfig(SAMPLE_CONFIG);
    expect(extractInterfacePrivateKey(parsed.interfaceBlock)).toBe("SERVERPRIVATEKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  });

  it("throws a descriptive error when the interface block has no PrivateKey line", () => {
    expect(() => extractInterfacePrivateKey("[Interface]\nAddress = 10.8.0.1/24\n")).toThrow(
      /not bootstrapped correctly/
    );
  });
});
