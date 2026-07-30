import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env";
import {
  extractInterfacePrivateKey,
  type WireGuardConfigRepository,
  type ParsedConfig,
} from "../repositories/wireguard-config.repository";
import type { WireGuardService } from "./wireguard.service";
import { nextAvailableIp } from "../utils/ip-allocator";
import { renderClientConfig } from "../utils/render-client-config";
import { ConflictError, NotFoundError } from "../utils/errors";
import { metrics } from "../metrics/registry";
import type { CreatePeerRequest, CreatePeerResult, PeerSummary } from "../types/peer";

export class PeerService {
  constructor(
    private readonly configRepo: WireGuardConfigRepository,
    private readonly wireguard: WireGuardService,
    private readonly logger: FastifyBaseLogger
  ) {}

  async listPeers(): Promise<PeerSummary[]> {
    const config = await this.configRepo.read();
metrics.peerCount.set(config.peers.length);
    return config.peers.map((peer) => ({ label: peer.label, publicKey: peer.publicKey, allowedIps: peer.allowedIps }));
  }

  async getPeer(publicKey: string): Promise<PeerSummary> {
    const config = await this.configRepo.read();
metrics.peerCount.set(config.peers.length);
    const peer = config.peers.find((p) => p.publicKey === publicKey);
    if (!peer) throw new NotFoundError(`No peer with public key ${publicKey}`);
    return { label: peer.label, publicKey: peer.publicKey, allowedIps: peer.allowedIps };
  }

  async createPeer(request: CreatePeerRequest): Promise<CreatePeerResult> {
    const config = await this.configRepo.read();

    const privateKey = await this.wireguard.generatePrivateKey();
    const publicKey = await this.wireguard.derivePublicKey(privateKey);

    if (config.peers.some((p) => p.publicKey === publicKey)) {
      // Cryptographically implausible for two X25519 keys to collide, but
      // costs nothing to check, and "silently overwrite a stranger's peer"
      // is not an acceptable failure mode if it somehow ever happened.
      throw new ConflictError(`Generated public key already exists as a peer: ${publicKey}`);
    }

    const presharedKey = await this.wireguard.generatePresharedKey();
    const ip = nextAvailableIp(
      env.WG_SUBNET_CIDR,
      config.peers.map((p) => p.allowedIps)
    );
    const allowedIps = `${ip}/32`;

    const nextConfig: ParsedConfig = {
      interfaceBlock: config.interfaceBlock,
      peers: [...config.peers, { label: request.label, publicKey, presharedKey, allowedIps }],
    };

    await this.applyConfig(nextConfig);
metrics.peerCount.set(nextConfig.peers.length);
metrics.peerCreations.inc();

    const serverPublicKey = await this.wireguard.derivePublicKey(extractInterfacePrivateKey(config.interfaceBlock));
    const clientConfig = renderClientConfig({
      privateKey,
      address: allowedIps,
      serverPublicKey,
      presharedKey,
      endpointHost: env.WG_ENDPOINT_HOST,
      endpointPort: env.WG_ENDPOINT_PORT,
      dns: env.WG_CLIENT_DNS,
      keepalive: env.WG_CLIENT_KEEPALIVE,
    });

    return { publicKey, privateKey, presharedKey, ip, config: clientConfig };
  }

  async deletePeer(publicKey: string): Promise<void> {
    const config = await this.configRepo.read();
    const exists = config.peers.some((p) => p.publicKey === publicKey);
    if (!exists) throw new NotFoundError(`No peer with public key ${publicKey}`);

    const nextConfig: ParsedConfig = {
      interfaceBlock: config.interfaceBlock,
      peers: config.peers.filter((p) => p.publicKey !== publicKey),
    };

    await this.applyConfig(nextConfig);
metrics.peerCount.set(nextConfig.peers.length);
metrics.peerDeletions.inc();
  }


  /**
   * Writes the new config atomically (see atomic-file: temp file, `wg-quick
   * strip` validation, then rename — the live file is never left invalid
   * or half-written) and reloads the interface via `wg syncconf`. If the
   * reload fails after the file was already replaced, the file is rolled
   * back to its previous contents so it stays in sync with what's actually
   * running — the alternative would be a wg0.conf that lies about the
   * live peer set until the next successful write.
   *
   * Goes through this.configRepo for both the write and the rollback path
   * (rather than reading env.WG_CONFIG_PATH directly) so a repository
   * constructed against any path — a test's temp file, in particular —
   * rolls back the file it actually wrote to.
   */
  private async applyConfig(nextConfig: ParsedConfig): Promise<void> {
    const previousContent = await this.configRepo.write(nextConfig, (tempPath) =>
      this.wireguard.validateConfigFile(tempPath)
    );

    try {
      await this.wireguard.reload(env.WG_INTERFACE, this.configRepo.path);
    } catch (error) {
      this.logger.error({ err: error }, "wg syncconf failed after config write — rolling back wg0.conf");
      await this.configRepo.restore(previousContent);
      throw error;
    }
  }
}
