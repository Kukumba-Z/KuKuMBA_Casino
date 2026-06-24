#!/usr/bin/env bash
# Pull latest code and (re)deploy. Schema is synced automatically by the API
# container on start. Run from the repo root.
set -e
cd "$(dirname "$0")/.."

COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"

echo "⬇️  Pulling latest…"
git pull --ff-only

echo "🐳  Building & starting…"
$COMPOSE up -d --build

echo "🧹  Pruning old images…"
docker image prune -f >/dev/null || true

echo "📋  Status:"
$COMPOSE ps
echo "✅  Done →  https://kukumba.space"
