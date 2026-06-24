# ─────────────────────────────────────────────────────────────
# KuKuMBA API — NestJS + Prisma (production image)
# Build context = repo root:  docker build -f apps/api/Dockerfile .
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Prisma needs OpenSSL present to pick the right engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# workspace manifests first (better layer caching); both are needed for a
# valid --frozen-lockfile resolve, but we only install the api subtree.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @kukumba/api
COPY apps/api apps/api
RUN pnpm --filter @kukumba/api prisma:generate \
 && pnpm --filter @kukumba/api build

# ── runtime ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# pnpm keeps packages in the root store; copy it plus the api package (with its symlinks).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/
COPY --from=build /app/apps/api /app/apps/api
COPY deploy/api-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
