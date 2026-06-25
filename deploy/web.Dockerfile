# ─────────────────────────────────────────────────────────────
# KuKuMBA web — builds the React SPA and serves it via nginx,
# reverse-proxying /api and /socket.io to the API container.
# Build context = repo root:  docker build -f deploy/web.Dockerfile .
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --no-frozen-lockfile --filter @kukumba/web
COPY apps/web apps/web
RUN pnpm --filter @kukumba/web build

# ── nginx ────────────────────────────────────────────────────
FROM nginx:1.27-alpine
# openssl: used by ensure-cert.sh to bootstrap TLS material so nginx always boots.
RUN apk add --no-cache openssl
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/web/ensure-cert.sh /usr/local/bin/ensure-cert.sh
COPY deploy/web/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/ensure-cert.sh /usr/local/bin/entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
