#!/bin/bash
set -euo pipefail
# Logged to a file; also shown on screen when run by hand with the install command.
exec > >(tee -a /var/log/veil-bootstrap.log) 2>&1

API_BASE="{{API_BASE}}"
SERVER_ID="{{SERVER_ID}}"
BOOTSTRAP_TOKEN="{{BOOTSTRAP_TOKEN}}"
AGENT_SHA256="{{AGENT_SHA256}}"
TCPGW_SHA256="{{TCPGW_SHA256}}"
FW_SHA256="{{FW_SHA256}}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard-tools iptables curl openssl python3

# VPS images from some providers (not AWS) ship with ufw on; open the two VPN ports there.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 51820/udp
  ufw allow 443/tcp
fi

cat > /etc/sysctl.d/99-veil.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.core.rmem_max = 4194304
net.core.wmem_max = 4194304
EOF
sysctl --system

umask 077
mkdir -p /etc/wireguard /etc/veil/tls /opt/veil
wg genkey > /etc/wireguard/server.key
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
  -subj "/CN=veil-edge" -keyout /etc/veil/tls/key.pem -out /etc/veil/tls/cert.pem

curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/veil_agent.py" -o /opt/veil/veil_agent.py
curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/veil_tcpgw.py" -o /opt/veil/veil_tcpgw.py
curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/fw.sh" -o /etc/veil/fw.sh
echo "${AGENT_SHA256}  /opt/veil/veil_agent.py" | sha256sum -c -
echo "${TCPGW_SHA256}  /opt/veil/veil_tcpgw.py" | sha256sum -c -
echo "${FW_SHA256}  /etc/veil/fw.sh" | sha256sum -c -
chmod 700 /etc/veil/fw.sh
chmod 755 /opt/veil
chmod 644 /opt/veil/veil_agent.py /opt/veil/veil_tcpgw.py

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.0.1/16
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/server.key)
PostUp = /etc/veil/fw.sh up
PostDown = /etc/veil/fw.sh down
EOF

cat > /etc/veil/agent.json <<EOF
{"apiBase":"${API_BASE}","serverId":"${SERVER_ID}","bootstrapToken":"${BOOTSTRAP_TOKEN}"}
EOF
chmod 600 /etc/veil/agent.json

cat > /etc/systemd/system/veil-agent.service <<'EOF'
[Unit]
Description=Veil edge agent
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/veil/veil_agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/veil-tcpgw.service <<'EOF'
[Unit]
Description=Veil TCP gateway
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/veil/veil_tcpgw.py
DynamicUser=yes
AmbientCapabilities=CAP_NET_BIND_SERVICE
LoadCredential=cert.pem:/etc/veil/tls/cert.pem
LoadCredential=key.pem:/etc/veil/tls/key.pem
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now wg-quick@wg0
systemctl enable --now veil-tcpgw
systemctl enable --now veil-agent
echo "Veil server is set up. It turns Active in the admin panel within a minute."
