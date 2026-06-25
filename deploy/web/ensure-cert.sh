#!/bin/sh
# Guarantee nginx can boot even before a real certificate exists.
#
# If /etc/letsencrypt has no cert for the domain yet (fresh server, or before
# the first certbot issuance), drop in a short-lived self-signed cert plus the
# helper files our nginx config includes. The real Let's Encrypt cert — placed
# in the mounted volume by certbot, or copied in from a previous setup —
# transparently takes over on the next nginx start/reload. This removes the
# classic chicken-and-egg crash loop ("cannot load certificate ... fullchain.pem").
set -e
DOMAIN="${CERT_DOMAIN:-kukumba.space}"
LE=/etc/letsencrypt
LIVE="$LE/live/$DOMAIN"
mkdir -p "$LIVE"

if [ ! -s "$LIVE/fullchain.pem" ] || [ ! -s "$LIVE/privkey.pem" ]; then
  echo "[ensure-cert] no certificate for $DOMAIN yet — generating a temporary self-signed one"
  openssl req -x509 -nodes -newkey rsa:2048 -days 3 \
    -keyout "$LIVE/privkey.pem" -out "$LIVE/fullchain.pem" \
    -subj "/CN=$DOMAIN" >/dev/null 2>&1
fi

# nginx config includes these two — create sane defaults if they're absent.
if [ ! -s "$LE/options-ssl-nginx.conf" ]; then
  cat > "$LE/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF
fi

[ -s "$LE/ssl-dhparams.pem" ] || openssl dhparam -out "$LE/ssl-dhparams.pem" 2048 >/dev/null 2>&1
