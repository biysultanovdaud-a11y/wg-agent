import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  API_KEY: z.string().min(32, "API_KEY must be at least 32 characters — generate one with `openssl rand -hex 32`"),
  WG_INTERFACE: z.string().min(1).default("wg0"),
  WG_CONFIG_PATH: z.string().min(1).default("/etc/wireguard/wg0.conf"),
  WG_SUBNET_CIDR: z.string().min(1).default("10.8.0.0/24"),
  // Not in the original spec's env list, but required for POST /peers to
  // return a config a client can actually connect with: the client's
  // [Peer] section needs to know where the server is. Without this the
  // "config" field would have nowhere to send traffic. See README.
  WG_ENDPOINT_HOST: z.string().min(1, "WG_ENDPOINT_HOST is required — the public hostname/IP clients connect to"),
  WG_ENDPOINT_PORT: z.coerce.number().int().positive().default(51820),
  WG_CLIENT_DNS: z.string().min(1).default("1.1.1.1, 1.0.0.1"),
  WG_CLIENT_KEEPALIVE: z.coerce.number().int().positive().default(25),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console -- logger isn't constructed yet at this point
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
