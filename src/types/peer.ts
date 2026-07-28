import { z } from "zod";

/** WireGuard keys: 32 raw bytes, base64-encoded — always 44 characters, always ending in '='. */
export const wgKeySchema = z
  .string()
  .length(44, "must be a 44-character base64 WireGuard key")
  .regex(/^[A-Za-z0-9+/]{43}=$/, "must be valid base64");

export const createPeerRequestSchema = z.object({
  /** Optional human-readable label stored as a comment above the peer's block in wg0.conf — purely for operator readability, never parsed back out as an identifier. */
  label: z.string().min(1).max(100).optional(),
});
export type CreatePeerRequest = z.infer<typeof createPeerRequestSchema>;

export const publicKeyParamSchema = z.object({
  publicKey: wgKeySchema,
});

/** A peer as stored/parsed in wg0.conf. */
export interface PeerRecord {
  label?: string | undefined;
  publicKey: string;
  presharedKey: string;
  allowedIps: string;
}

/** What POST /peers returns — the only moment the private key exists anywhere; it is never written to wg0.conf (only the public key is, matching how a real WireGuard peer definition works) and never logged. */
export interface CreatePeerResult {
  publicKey: string;
  privateKey: string;
  presharedKey: string;
  ip: string;
  config: string;
}

export interface PeerSummary {
  label?: string | undefined;
  publicKey: string;
  allowedIps: string;
}
