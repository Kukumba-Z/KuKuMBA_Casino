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
RUN pnpm install --frozen-lockfile --filter @kukumba/web
COPY apps/web apps/web
RUN pnpm --filter @kukumba/web build

# ── nginx ────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
