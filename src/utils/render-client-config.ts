export interface ClientConfigParams {
  privateKey: string;
  address: string; // e.g. "10.8.0.2/32"
  serverPublicKey: string;
  presharedKey: string;
  endpointHost: string;
  endpointPort: number;
  dns: string;
  keepalive: number;
}

/** Renders a complete, spec-correct WireGuard client config — the exact bytes handed back in POST /peers' `config` field. */
export function renderClientConfig(params: ClientConfigParams): string {
  const { privateKey, address, serverPublicKey, presharedKey, endpointHost, endpointPort, dns, keepalive } = params;

  return [
    "[Interface]",
    `PrivateKey = ${privateKey}`,
    `Address = ${address}`,
    `DNS = ${dns}`,
    "",
    "[Peer]",
    `PublicKey = ${serverPublicKey}`,
    `PresharedKey = ${presharedKey}`,
    `Endpoint = ${endpointHost}:${endpointPort}`,
    "AllowedIPs = 0.0.0.0/0, ::/0",
    `PersistentKeepalive = ${keepalive}`,
    "",
  ].join("\n");
}
