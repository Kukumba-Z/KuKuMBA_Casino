#!/usr/bin/env bash
# Obtain the initial Let's Encrypt certificate for kukumba.space.
# Adapted from the well-known nginx + certbot bootstrap. Run ONCE, before the
# first `docker compose up`. Re-running is safe.
set -e

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
domains=(kukumba.space www.kukumba.space)
email="${CERTBOT_EMAIL:-admin@kukumba.space}"   # used for renewal notices
staging="${CERTBOT_STAGING:-0}"                 # set to 1 to test against LE staging
data_path="./deploy/certbot"
rsa_key_size=4096

if [ -d "$data_path/conf/live/${domains[0]}" ]; then
  read -rp "Existing certificate for ${domains[0]} found. Replace it? (y/N) " ok
  [ "$ok" = "y" ] || [ "$ok" = "Y" ] || exit
fi

echo "### Downloading recommended TLS parameters …"
mkdir -p "$data_path/conf" "$data_path/www"
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"

echo "### Creating a dummy certificate so nginx can start …"
live_path="/etc/letsencrypt/live/${domains[0]}"
mkdir -p "$data_path/conf/live/${domains[0]}"
$COMPOSE run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
    -keyout '$live_path/privkey.pem' -out '$live_path/fullchain.pem' -subj '/CN=localhost'" certbot

echo "### Starting nginx …"
$COMPOSE up --force-recreate -d web

echo "### Removing the dummy certificate …"
$COMPOSE run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${domains[0]} \
  /etc/letsencrypt/archive/${domains[0]} \
  /etc/letsencrypt/renewal/${domains[0]}.conf" certbot

domain_args=""
for d in "${domains[@]}"; do domain_args="$domain_args -d $d"; done
case "$email" in "") email_arg="--register-unsafely-without-email" ;; *) email_arg="--email $email" ;; esac
[ "$staging" != "0" ] && staging_arg="--staging"

echo "### Requesting the real Let's Encrypt certificate …"
$COMPOSE run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg $email_arg $domain_args \
    --rsa-key-size $rsa_key_size --agree-tos --force-renewal" certbot

echo "### Reloading nginx …"
$COMPOSE exec web nginx -s reload || true
echo "✅  Certificates installed. Now run: docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build"
