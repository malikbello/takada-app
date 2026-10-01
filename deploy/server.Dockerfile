# syntax=docker/dockerfile:1.7
# Takada server image: the same image is the clinic hub and the cloud service (ROLE env).
# It also serves the built phone app, so phones load Takada from the clinic hub.
FROM node:22.20-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
# Optional extra CA (build secret "ca") for builds behind a TLS-inspecting proxy; absent in CI.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca COREPACK_NPM_REGISTRY=https://registry.npmjs.org; fi; \
    pnpm install --frozen-lockfile
RUN pnpm --filter @takada/mobile build && pnpm --filter @takada/server build

# Runtime: distroless Node 22 (no shell, no npm, no package manager, non-root). Only the
# self-contained server bundle and the built phone app are copied in.
FROM build AS datadir
RUN mkdir -p /data-empty

FROM gcr.io/distroless/nodejs22-debian13:nonroot
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/public DB_PATH=/data/takada.sqlite AUDIO_DIR=/data/audio
WORKDIR /app
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/mobile/dist ./public
COPY --from=datadir --chown=nonroot:nonroot /data-empty /data
USER nonroot
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["--disable-warning=ExperimentalWarning", "dist/main.js"]
