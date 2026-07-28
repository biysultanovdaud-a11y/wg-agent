import { readFile } from "node:fs/promises";
import { atomicWrite, restore, type AtomicWriteOptions } from "../utils/atomic-file";
import type { PeerRecord } from "../types/peer";

export interface ParsedConfig {
  /** The [Interface] section, preserved byte-for-byte — this is where the server's own private key, listen port, and PostUp/PostDown firewall rules live. The repository only ever adds/removes [Peer] blocks; it never rewrites this section, to keep zero risk of corrupting the node's own identity. */
  interfaceBlock: string;
  peers: PeerRecord[];
}

const LABEL_COMMENT_PREFIX = "# label:";

function parsePeerBlock(blockLines: string[]): PeerRecord | null {
  let label: string | undefined;
  let publicKey: string | undefined;
  let presharedKey: string | undefined;
  let allowedIps: string | undefined;

  for (const line of blockLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(LABEL_COMMENT_PREFIX)) {
      label = trimmed.slice(LABEL_COMMENT_PREFIX.length).trim();
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "publickey") publicKey = value;
    else if (key === "presharedkey") presharedKey = value;
    else if (key === "allowedips") allowedIps = value;
  }

  if (!publicKey || !allowedIps) return null;
  return { label, publicKey, presharedKey: presharedKey ?? "", allowedIps };
}

/** Parses a wg0.conf file into its untouched [Interface] section plus a structured list of [Peer] blocks. */
export function parseConfig(content: string): ParsedConfig {
  const lines = content.split("\n");

  const interfaceLines: string[] = [];
  const peerBlocks: string[][] = [];
  let currentPeerBlock: string[] | null = null;
  let inInterface = false;
  // Comment/blank lines seen between blocks — serializeConfig writes a
  // peer's "# label:" comment on the line *before* its [Peer] header, so
  // dropping everything before a header unconditionally (as this used to)
  // silently lost every label on the next read: round-tripping a labeled
  // peer through write-then-read made the label vanish. Buffered here and
  // attached to whichever peer block follows, instead.
  let pendingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.toLowerCase() === "[interface]") {
      inInterface = true;
      currentPeerBlock = null;
      pendingLines = [];
      interfaceLines.push(line);
      continue;
    }

    if (trimmed.toLowerCase() === "[peer]") {
      inInterface = false;
      currentPeerBlock = [...pendingLines, line];
      pendingLines = [];
      peerBlocks.push(currentPeerBlock);
      continue;
    }

    if (trimmed.startsWith(LABEL_COMMENT_PREFIX)) {
      // inInterface stays true for everything up to the *next* header
      // line, including the blank line and label comment that trail the
      // [Interface] section right before the next [Peer] — so without
      // this check, a label comment gets absorbed into interfaceLines
      // before pendingLines ever sees it. A label comment never belongs
      // to [Interface] (which has no such concept) regardless of which
      // section we're nominally still inside, so it's special-cased here.
      pendingLines.push(line);
      continue;
    }

    if (inInterface) {
      interfaceLines.push(line);
    } else if (currentPeerBlock) {
      currentPeerBlock.push(line);
    } else {
      // Not yet inside any block — hold onto it in case a [Peer] header
      // immediately follows; truly stray lines (e.g. trailing comments
      // after the last peer) are simply never consumed and drop out here.
      pendingLines.push(line);
    }
  }

  const peers = peerBlocks.map(parsePeerBlock).filter((p): p is PeerRecord => p !== null);

  return {
    interfaceBlock: interfaceLines.join("\n").trimEnd(),
    peers,
  };
}

function serializePeer(peer: PeerRecord): string {
  const lines: string[] = [];
  if (peer.label) lines.push(`${LABEL_COMMENT_PREFIX} ${peer.label}`);
  lines.push("[Peer]");
  lines.push(`PublicKey = ${peer.publicKey}`);
  if (peer.presharedKey) lines.push(`PresharedKey = ${peer.presharedKey}`);
  lines.push(`AllowedIPs = ${peer.allowedIps}`);
  return lines.join("\n");
}

export function serializeConfig(config: ParsedConfig): string {
  const blocks = [config.interfaceBlock, ...config.peers.map(serializePeer)];
  return blocks.join("\n\n") + "\n";
}

/** Pulls just the PrivateKey value out of the preserved [Interface] blob — a read, not a parse-and-reserialize, so the "never rewrite this section" guarantee in ParsedConfig's doc comment still holds. Needed to derive the server's own public key for client configs. */
export function extractInterfacePrivateKey(interfaceBlock: string): string {
  const match = interfaceBlock
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith("privatekey"));

  // Splitting on "=" and taking [1] silently truncated every key at its
  // own base64 padding: a WireGuard key always ends in "=", so
  // "PrivateKey = XYZ=".split("=") is ["PrivateKey ", " XYZ", ""], and
  // [1] loses that trailing "=" — corrupting every extracted server key.
  // indexOf + slice (matching parsePeerBlock's approach above) splits on
  // the first "=" only, which is what a "key = value" line actually needs.
  const eq = match?.indexOf("=") ?? -1;
  const value = eq === -1 ? undefined : match!.slice(eq + 1).trim();
  if (!value)
    throw new Error("wg0.conf's [Interface] section has no PrivateKey — the node was not bootstrapped correctly");
  return value;
}

export class WireGuardConfigRepository {
  constructor(private readonly configPath: string) {}

  /** Exposes the path this repository actually operates on — so callers (PeerService's reload/rollback) go through the repository's own configured path instead of separately reading env.WG_CONFIG_PATH, which could in principle disagree with it (e.g. in a test constructing a repository against a temp file). */
  get path(): string {
    return this.configPath;
  }

  async read(): Promise<ParsedConfig> {
    const content = await readFile(this.configPath, "utf8");
    return parseConfig(content);
  }

  /** Writes the full config back atomically — see utils/atomic-file for the write-temp/validate/rename/rollback contract. Returns the previous file content so the caller can restore it if something downstream (like reloading the interface) fails. */
  async write(config: ParsedConfig, validate?: AtomicWriteOptions["validate"]): Promise<string | null> {
    const serialized = serializeConfig(config);
    return atomicWrite(this.configPath, serialized, { validate });
  }

  /**
   * The rollback half of write()'s contract, scoped to this repository's
   * own configPath — callers (PeerService) restore through here rather
   * than reaching into the global env config directly, so a repository
   * constructed against any path (a test's temp file, for instance)
   * rolls back the file it actually wrote to, not whatever env.WG_CONFIG_PATH
   * happens to be.
   */
  async restore(previousContent: string | null): Promise<void> {
    await restore(this.configPath, previousContent);
  }
}
