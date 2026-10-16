#!/bin/bash
# Veil control server on a fresh Ubuntu 24.04 (any provider): PostgreSQL 16, Node.js 22, the API,
# the admin panel and Caddy (automatic HTTPS). Run as root:
#
#   bash install.sh <host name> <admin email>
#
# <host name> must point to this server's public IP (your domain, or for a quick start
# <ip-with-dashes>.sslip.io, e.g. 13-233-1-2.sslip.io). Ports 80 and 443 must be open.
# Running it again updates the code and keeps the database and secrets.
set -euo pipefail
exec > >(tee -a /var/log/veil-control-install.log) 2>&1

HOST="${1:?host name required}"
ADMIN_EMAIL="${2:?admin email required}"
REPO="${VEIL_REPO:-https://github.com/dev-zainkhan/VPN.git}"
BRANCH="${VEIL_BRANCH:-main}"
APP=/opt/veil-control
ENV_FILE=$APP/backend.env
export DEBIAN_FRONTEND=noninteractive

echo "== swap (builds need more than 1 GB RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== packages"
apt-get update -y
apt-get install -y postgresql git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https openssl
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== user and code"
id veil >/dev/null 2>&1 || useradd --system --create-home --home-dir $APP --shell /usr/sbin/nologin veil
if [ -d $APP/repo/.git ]; then
  sudo -u veil git -C $APP/repo fetch --depth 1 origin "$BRANCH"
  sudo -u veil git -C $APP/repo checkout -B "$BRANCH" FETCH_HEAD
else
  sudo -u veil git clone --depth 1 --branch "$BRANCH" "$REPO" $APP/repo
fi

echo "== database"
if [ -f $ENV_FILE ]; then
  DB_PASS=$(sed -n 's#^DATABASE_URL=postgresql://veil:\([^@]*\)@.*#\1#p' $ENV_FILE)
else
  DB_PASS=$(openssl rand -hex 24)
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'veil') THEN
    CREATE ROLE veil LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE veil PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'veil'" | grep -q 1 || sudo -u postgres createdb -O veil veil

echo "== settings (secrets are made here once and never leave this server)"
if [ ! -f $ENV_FILE ]; then
  ADMIN_PASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)
  cat > $ENV_FILE <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://veil:$DB_PASS@127.0.0.1:5432/veil
PUBLIC_BASE_URL=https://$HOST
MASTER_KEY=$(openssl rand -base64 32)
TOKEN_PEPPER=$(openssl rand -base64 32)
ABUSE_PEPPER=$(openssl rand -base64 32)
ADMOB_AD_UNIT_ID=ca-app-pub-3940256099942544/5224354917
EDGE_FILES_DIR=$APP/repo/edge
COOKIE_SECURE=true
JOBS_ENABLED=true
LOG_LEVEL=info
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_INITIAL_PASSWORD=$ADMIN_PASS
EOF
  install -m 600 /dev/null /root/veil-admin-login.txt
  printf 'Admin panel: https://%s\nEmail: %s\nPassword: %s\n' "$HOST" "$ADMIN_EMAIL" "$ADMIN_PASS" > /root/veil-admin-login.txt
fi
sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=https://$HOST#" $ENV_FILE
chown veil:veil $ENV_FILE
chmod 600 $ENV_FILE

echo "== build the API"
sudo -u veil bash -c "cd $APP/repo/backend && npm ci --no-audit --no-fund && npx prisma generate && npm run build"
sudo -u veil bash -c "cd $APP/repo/backend && set -a && . $ENV_FILE && set +a && npx prisma migrate deploy && npx prisma db seed"

echo "== build the admin panel"
sudo -u veil bash -c "cd $APP/repo/admin-panel && npm ci --no-audit --no-fund && npm run build"
mkdir -p /var/www/veil-admin
rm -rf /var/www/veil-admin/*
cp -r $APP/repo/admin-panel/dist/. /var/www/veil-admin/

echo "== public pages (privacy policy, terms)"
# The support e-mail shown on them: VEIL_SUPPORT_EMAIL, remembered in $APP/support-email.
[ -n "${VEIL_SUPPORT_EMAIL:-}" ] && echo "$VEIL_SUPPORT_EMAIL" > $APP/support-email
SUPPORT_EMAIL=$(cat $APP/support-email 2>/dev/null || echo "$ADMIN_EMAIL")
for f in $APP/repo/deploy/control/site/*.html; do
  sed "s#{{SUPPORT_EMAIL}}#$SUPPORT_EMAIL#g" "$f" > /var/www/veil-admin/$(basename "$f")
done

echo "== services"
cat > /etc/systemd/system/veil-api.service <<EOF
[Unit]
Description=Veil API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=veil
WorkingDirectory=$APP/repo/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# No access log: Caddy only proxies (the API logs routes, never IPs or URLs).
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
	encode gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}
	handle {
		root * /var/www/veil-admin
		try_files {path} /index.html
		file_server
	}
}
EOF

systemctl daemon-reload
systemctl enable --now veil-api
systemctl restart veil-api
systemctl enable caddy
systemctl restart caddy

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then break; fi
  sleep 2
done
echo "== done: https://$HOST  (login details: /root/veil-admin-login.txt)"
