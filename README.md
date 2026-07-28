# wg-agent

Secure REST API for remote WireGuard peer management. Runs on every
Vedeno VPN node; the main Vedeno app (`apps/web`) talks to it instead of
SSHing in or shelling out itself — see `apps/web/docs/VPN_ARCHITECTURE.md`
for how this fits into the broader system (this service is what a real
`WireGuardAgentProvider` implementation, not yet written, would call).

## Requirements

- Node.js 22 LTS
- pnpm
- A Linux host with `wireguard-tools` installed and an already-bootstrapped
  `wg0` interface (see "Node bootstrap" below) — this service manages an
  *existing* interface, it doesn't create one from nothing.

## Setup

```bash
pnpm install
cp .env.example .env
# fill in API_KEY (openssl rand -hex 32) and WG_ENDPOINT_HOST at minimum
pnpm run dev
```

## API

Every route, including `/health`, requires:

```
Authorization: Bearer <API_KEY>
```

Rejected requests get `401 { error, code: "UNAUTHORIZED" }`. This is a
deliberate reading of "every request must require" — the operational cost
is that a load balancer health probe or Docker `HEALTHCHECK` needs the key
too (the `Dockerfile` and `docker-compose.yml` here already do this
correctly).

### `GET /health`

```json
{ "status": "ok", "hostname": "vpn1", "uptime": 1234.5, "version": "1.0.0" }
```

### `POST /peers`

Body (optional): `{ "label": "Alice's laptop" }`

Generates a keypair + preshared key via the real `wg` binary, allocates
the next free IP in `WG_SUBNET_CIDR`, appends the peer to `wg0.conf`
(atomically — see Safety below), and reloads the interface without
dropping other peers' sessions (`wg syncconf`, not a full `wg-quick`
down/up cycle).

```json
{
  "publicKey": "...",
  "privateKey": "...",
  "presharedKey": "...",
  "ip": "10.8.0.2",
  "config": "[Interface]\nPrivateKey = ...\n..."
}
```

The private key in this response is the only place it ever exists —
`wg0.conf` stores only the public key (that's all a real WireGuard peer
definition needs), and nothing here logs or persists it elsewhere.

### `GET /peers`, `GET /peers/:publicKey`

Return peer summaries (`label`, `publicKey`, `allowedIps`) — never private
keys, since none are stored to return.

### `DELETE /peers/:publicKey`

Removes the peer and reloads the interface. `204` on success, `404` if
the public key isn't a registered peer.

## Safety: how wg0.conf is protected

1. New content is written to a temp file in the same directory (so the
   final step is an atomic same-filesystem rename, not a copy).
2. `wg-quick strip <tempfile>` validates it — a real syntax check, not
   just "did the write not throw."
3. Only then does the temp file replace the real one.
4. The interface reload (`wg syncconf`) happens *after* the file is
   live. If that fails, `wg0.conf` is rolled back to its pre-write
   content — the file on disk never claims a peer exists that the
   running interface doesn't actually have.

See `src/utils/atomic-file.ts` and `src/services/peer.service.ts`
(`applyConfig`) for the implementation; `test/atomic-file.test.ts` and
`test/peer.service.test.ts`'s rollback test verify this directly.

## Architecture

```
routes/        Fastify route registration only — no logic
controllers/    Parses/validates HTTP in, calls a service, HTTP out
services/       Business logic (PeerService orchestrates; WireGuardService
                wraps the wg/wg-quick binaries)
repositories/   wg0.conf parsing/serialization/atomic writes
utils/          exec wrapper, IP allocator, atomic file writer, errors
middleware/     Bearer token auth
config/         Zod-validated environment
```

`src/utils/exec.ts` is the *only* place that spawns a process, always via
`execFile` with an argv array — never a shell string, so there is no
command injection surface regardless of what ends up in an argument.

## Node bootstrap (one-time, per server)

This service assumes `wg0` already exists. To bootstrap a fresh node:

```bash
apt-get update && apt-get install -y wireguard-tools
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
PrivateKey = $(cat /etc/wireguard/server_private.key)
Address = 10.8.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf && sysctl -p
wg-quick up wg0 && systemctl enable wg-quick@wg0
```

Then deploy this service (`docker compose up -d --build`), which bind-mounts
the host's real `/etc/wireguard` and manages peers within that same
`wg0.conf` from then on.

## Testing

```bash
pnpm test
```

No real `wg` binary or root/`NET_ADMIN` is needed to run the test suite —
`WireGuardService` is mocked in `peer.service.test.ts` to test the
orchestration logic (IP allocation, atomic writes, rollback-on-failure)
in isolation, and `exec.test.ts` exercises the `execFile` wrapper itself
against ordinary system binaries. The one thing this suite can't verify
is a real `wg`/`wg-quick` invocation succeeding on an actual interface —
that needs a real Linux host with WireGuard installed.

## Docker

```bash
docker compose up -d --build
```

Requires `NET_ADMIN` and `SYS_MODULE` capabilities (already set in
`docker-compose.yml`) for `wg`/`wg-quick` to manage the interface, and a
bind mount of the host's `/etc/wireguard` so the container operates on
the same config the host's own `wg-quick@wg0` service uses.
