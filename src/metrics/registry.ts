import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const metrics = {
  httpRequests: new Counter({
    name: "wg_agent_http_requests_total",
    help: "Total number of HTTP requests.",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  }),

  httpRequestDuration: new Histogram({
    name: "wg_agent_http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  }),

  peerCount: new Gauge({
    name: "wg_agent_peers",
    help: "Current number of configured WireGuard peers.",
    registers: [registry],
  }),

  peerCreations: new Counter({
    name: "wg_agent_peer_creations_total",
    help: "Total number of created peers.",
    registers: [registry],
  }),

  peerDeletions: new Counter({
    name: "wg_agent_peer_deletions_total",
    help: "Total number of deleted peers.",
    registers: [registry],
  }),

  reloadFailures: new Counter({
    name: "wg_agent_reload_failures_total",
    help: "Total number of WireGuard reload failures.",
    registers: [registry],
  }),
};
