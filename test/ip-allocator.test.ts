import { describe, expect, it } from "vitest";
import { nextAvailableIp, isIpInSubnet } from "../src/utils/ip-allocator";
import { SubnetExhaustedError } from "../src/utils/errors";

describe("nextAvailableIp", () => {
  it("starts allocation at .2, reserving .0 (network) and .1 (gateway/server)", () => {
    expect(nextAvailableIp("10.8.0.0/24", [])).toBe("10.8.0.2");
  });

  it("skips addresses already in use", () => {
    expect(nextAvailableIp("10.8.0.0/24", ["10.8.0.2/32", "10.8.0.3/32"])).toBe("10.8.0.4");
  });

  it("fills a gap rather than always appending at the end", () => {
    expect(nextAvailableIp("10.8.0.0/24", ["10.8.0.2/32", "10.8.0.4/32"])).toBe("10.8.0.3");
  });

  it("accepts bare IPs as well as /32 CIDR notation for the used list", () => {
    expect(nextAvailableIp("10.8.0.0/24", ["10.8.0.2"])).toBe("10.8.0.3");
  });

  it("throws SubnetExhaustedError once every usable address is taken", () => {
    // /30 has exactly one usable host address after network(.0)/gateway(.1) reservation: .2. Broadcast is .3.
    expect(() => nextAvailableIp("10.8.0.0/30", ["10.8.0.2/32"])).toThrow(SubnetExhaustedError);
  });

  it("never allocates the broadcast address", () => {
    const ip = nextAvailableIp("10.8.0.0/30", []);
    expect(ip).toBe("10.8.0.2");
    expect(ip).not.toBe("10.8.0.3"); // .3 is broadcast for a /30
  });
});

describe("isIpInSubnet", () => {
  it("confirms membership", () => {
    expect(isIpInSubnet("10.8.0.5", "10.8.0.0/24")).toBe(true);
  });

  it("rejects an address outside the subnet", () => {
    expect(isIpInSubnet("10.9.0.5", "10.8.0.0/24")).toBe(false);
  });
});
