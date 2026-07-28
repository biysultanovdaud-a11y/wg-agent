import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      // src/config/env.ts calls process.exit(1) on missing required vars
      // (API_KEY, WG_ENDPOINT_HOST have no defaults) — these must be set
      // before anything imports it transitively, or the whole test
      // process dies instead of failing a single test.
      API_KEY: "test-api-key-must-be-at-least-32-characters-long",
      WG_ENDPOINT_HOST: "vpn-test.vedeno.example",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**"],
    },
  },
});
