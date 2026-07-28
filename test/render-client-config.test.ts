import { describe, expect, it } from "vitest";
import { renderClientConfig } from "../src/utils/render-client-config";

const PARAMS = {
  privateKey: "CLIENTPRIVATEKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  address: "10.8.0.2/32",
  serverPublicKey: "SERVERPUBLICKEYAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  presharedKey: "PSKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  endpointHost: "vpn1.vedeno.example",
  endpointPort: 51820,
  dns: "1.1.1.1, 1.0.0.1",
  keepalive: 25,
};

describe("renderClientConfig", () => {
  it("includes every required WireGuard field", () => {
    const config = renderClientConfig(PARAMS);
    expect(config).toContain("[Interface]");
    expect(config).toContain(`PrivateKey = ${PARAMS.privateKey}`);
    expect(config).toContain(`Address = ${PARAMS.address}`);
    expect(config).toContain(`DNS = ${PARAMS.dns}`);
    expect(config).toContain("[Peer]");
    expect(config).toContain(`PublicKey = ${PARAMS.serverPublicKey}`);
    expect(config).toContain(`PresharedKey = ${PARAMS.presharedKey}`);
    expect(config).toContain(`Endpoint = ${PARAMS.endpointHost}:${PARAMS.endpointPort}`);
    expect(config).toContain("AllowedIPs = 0.0.0.0/0, ::/0");
    expect(config).toContain(`PersistentKeepalive = ${PARAMS.keepalive}`);
  });

  it("never puts the client's private key in the [Peer] section or the server's public key in [Interface]", () => {
    const config = renderClientConfig(PARAMS);
    const [interfaceSection, peerSection] = config.split("[Peer]");
    expect(peerSection).not.toContain(PARAMS.privateKey);
    expect(interfaceSection).not.toContain(PARAMS.serverPublicKey);
  });
});
