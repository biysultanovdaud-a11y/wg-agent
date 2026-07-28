# wg-agent — runs directly on each Vedeno VPN node.
# Build from this directory: docker build -t wg-agent .

FROM node:22-alpine AS base
RUN corepack enable

# ---- Dependencies (full, including dev, for the build stage) ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# Prune devDependencies out of node_modules in place, rather than a second
# `pnpm install --prod` pass — keeps the exact dependency tree the build
# was verified against instead of re-resolving it.
RUN pnpm prune --prod

# ---- Runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S wgagent && adduser -S wgagent -G wgagent

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# wg/wg-quick themselves — this image runs the Node process, but the
# process shells out to these via execFile (see src/utils/exec.ts), so
# they must exist in the same container, not just on the host.
RUN apk add --no-cache wireguard-tools iptables

# NET_ADMIN/SYS_MODULE (granted at the container level — see
# docker-compose.yml) let wg/wg-quick manage the wg0 interface; they don't
# require running the Node process itself as root, so it still drops
# privileges after the two apk packages above are installed.
USER wgagent

EXPOSE 8787
# /health requires the same Bearer token as every other route (see
# src/middleware/auth.ts's doc comment on why that's not carved out) —
# this HEALTHCHECK has to send it too, or Docker would report the
# container unhealthy on a 401 even when it's actually fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||8787,path:'/health',headers:{authorization:'Bearer '+process.env.API_KEY}}, r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
