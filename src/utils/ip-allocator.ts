import { SubnetExhaustedError } from "./errors";

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function intToIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

interface ParsedCidr {
  networkInt: number;
  prefixLength: number;
  hostCount: number;
}

function parseCidr(cidr: string): ParsedCidr {
  const [ip, prefixStr] = cidr.split("/");
  if (!ip || !prefixStr) throw new Error(`Invalid CIDR: ${cidr}`);
  const prefixLength = Number(prefixStr);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    throw new Error(`Invalid CIDR prefix length: ${cidr}`);
  }
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  const networkInt = ipToInt(ip) & mask;
  const hostCount = 2 ** (32 - prefixLength);
  return { networkInt, prefixLength, hostCount };
}

/** Strips an optional "/32" suffix — peers are stored in AllowedIPs as host addresses, but this allocator only cares about the bare IP. */
function stripHostSuffix(ipOrCidr: string): string {
  return ipOrCidr.split("/")[0]!;
}

/**
 * Finds the first unused address in `subnetCidr`, skipping the network
 * address (offset 0) and the gateway address (offset 1, reserved for the
 * server's own wg0 interface — matches the bootstrap convention of
 * Address = <subnet>.1/24 on the node). For a /24 this yields addresses
 * starting at .2, same convention the main Vedeno app's mock VPN provider
 * already uses, kept consistent on purpose.
 */
export function nextAvailableIp(subnetCidr: string, usedIps: string[]): string {
  const { networkInt, hostCount } = parseCidr(subnetCidr);
  const used = new Set(usedIps.map((ip) => ipToInt(stripHostSuffix(ip))));

  const broadcastInt = networkInt + hostCount - 1;
  const firstUsableOffset = 2; // 0 = network address, 1 = gateway/server

  for (let offset = firstUsableOffset; networkInt + offset < broadcastInt; offset++) {
    const candidate = networkInt + offset;
    if (!used.has(candidate)) return intToIp(candidate);
  }

  throw new SubnetExhaustedError(subnetCidr);
}

export function isIpInSubnet(ip: string, subnetCidr: string): boolean {
  const { networkInt, hostCount } = parseCidr(subnetCidr);
  const ipInt = ipToInt(stripHostSuffix(ip));
  return ipInt >= networkInt && ipInt < networkInt + hostCount;
}
