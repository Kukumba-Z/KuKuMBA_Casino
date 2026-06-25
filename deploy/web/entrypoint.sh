#!/bin/sh
# Web container entrypoint: make sure TLS material exists (so nginx never
# crash-loops), then run nginx with a periodic reload so renewed certs get
# picked up without a restart.
set -e
/usr/local/bin/ensure-cert.sh

# Reload every 6h (21600s) to pick up certificate renewals. Errors are ignored
# so a transient reload failure never kills the container.
( while :; do sleep 21600; nginx -s reload 2>/dev/null || true; done ) &

exec nginx -g 'daemon off;'
