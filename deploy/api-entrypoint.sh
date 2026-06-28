#!/usr/bin/env bash
# Entrypoint for the API container: wait for the DB, sync schema, optionally
# seed, then start the server.
set -e
cd /app/apps/api

echo "⏳  Waiting for database…"
for i in $(seq 1 30); do
  if npx prisma db push --skip-generate >/tmp/dbpush.log 2>&1; then
    echo "✅  Schema in sync."
    break
  fi
  echo "   db not ready yet ($i/30)…"
  sleep 2
  if [ "$i" = "30" ]; then echo "❌  Database never became ready:"; cat /tmp/dbpush.log; exit 1; fi
done

# Always reconcile known-stale defaults (idempotent, won't touch admin edits).
echo "🔧  Reconciling config…"
npx tsx prisma/reconcile.ts || echo "⚠  Reconcile failed (continuing)."

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "🌱  Seeding database…"
  npx tsx prisma/seed.ts || echo "⚠  Seed failed (continuing)."
fi

echo "🦄  Starting KuKuMBA API…"
exec node dist/main.js
