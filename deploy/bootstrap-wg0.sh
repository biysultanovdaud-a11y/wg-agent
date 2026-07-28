#!/usr/bin/env bash
# Bootstraps a fresh WireGuard node for wg-agent to manage.
#
# Run this ON the VPS itself (as root, or via sudo) — it has to be, since
# generating the server's private key anywhere else and copying it over
# means that key touched a second machine and a network transfer, which is
# exactly the thing you don't want for a key that's supposed to never
# leave the box. There's no remote-execution path for this from outside;
# copy this file to the server and run it there.
#
# Idempotent: safe to re-run. It will NOT overwrite an existing
# /etc/wireguard/wg0.conf — if one exists, it exits without touching it.
#
# Usage:
#   sudo bash bootstrap-wg0.sh
#
# Matches wg-agent's defaults exactly (src/config/env.ts) — no backend
# env vars need to change after this runs:
#   WG_INTERFACE=wg0
#   WG_CONFIG_PATH=/etc/wireguard/wg0.conf
#   WG_SUBNET_CIDR=10.8.0.0/24

set -euo pipefail

WG_DIR="/etc/wireguard"
WG_CONF="${WG_DIR}/wg0.conf"
WG_ADDRESS="10.8.0.1/24"
WG_PORT="51820"

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (sudo bash bootstrap-wg0.sh)." >&2
  exit 1
fi

if [[ -f "$WG_CONF" ]]; then
  echo "Refusing to run: $WG_CONF already exists. Delete it first if you really want to regenerate the server identity (this would invalidate every already-issued client config)." >&2
  exit 1
fi

echo "==> Installing wireguard-tools and qrencode"
apt-get update -qq
apt-get install -y wireguard-tools qrencode iptables

echo "==> Detecting the default outbound network interface"
DEFAULT_IFACE="$(ip route show default | awk '{print $5; exit}')"
if [[ -z "$DEFAULT_IFACE" ]]; then
  echo "Could not detect a default route interface. Set DEFAULT_IFACE manually and re-run, or edit wg0.conf's PostUp/PostDown after this script finishes." >&2
  exit 1
fi
echo "    Using interface: $DEFAULT_IFACE"

echo "==> Generating server keypair"
mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"
umask 077
wg genkey | tee "${WG_DIR}/server_private.key" | wg pubkey > "${WG_DIR}/server_public.key"
SERVER_PRIVATE_KEY="$(cat "${WG_DIR}/server_private.key")"
SERVER_PUBLIC_KEY="$(cat "${WG_DIR}/server_public.key")"

echo "==> Writing $WG_CONF"
cat > "$WG_CONF" <<EOF
[Interface]
PrivateKey = ${SERVER_PRIVATE_KEY}
Address = ${WG_ADDRESS}
ListenPort = ${WG_PORT}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${DEFAULT_IFACE} -j MASQUERADE
EOF
chmod 600 "$WG_CONF"

echo "==> Enabling IP forwarding"
cat > /etc/sysctl.d/99-wireguard.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
sysctl --system > /dev/null

echo "==> Starting and enabling wg-quick@wg0"
systemctl enable --now wg-quick@wg0

echo ""
echo "==> Done. Verify with:"
echo "    ls -la $WG_DIR"
echo "    cat $WG_CONF"
echo "    wg show"
echo "    systemctl status wg-quick@wg0"
echo ""
echo "Server public key (needed nowhere in wg-agent's own config — it derives"
echo "this itself from the private key at request time — but useful to have"
echo "on hand): ${SERVER_PUBLIC_KEY}"
echo ""
echo "REMEMBER: open UDP ${WG_PORT} in whatever sits in front of this box —"
echo "a cloud provider security group, or ufw if it's active (ufw status)."
echo "wg-quick and iptables being correctly configured doesn't help if"
echo "traffic never reaches the box in the first place. This script cannot"
echo "check that for you from inside the VPS."
