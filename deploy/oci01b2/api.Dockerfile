# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN node -e "if(process.platform!=='linux'||!['arm64','x64'].includes(process.arch)||process.versions.node.split('.')[0]!=='22')process.exit(1)"

FROM base AS context-audit
COPY . /context
RUN node /context/deploy/oci01b2/audit-context.cjs /context && touch /context-audit.ok

FROM base AS dependencies
RUN --mount=type=bind,from=context-audit,source=/context-audit.ok,target=/context-audit.ok test -f /context-audit.ok
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --no-audit --no-fund

FROM dependencies AS build
COPY prisma ./prisma
RUN node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
RUN node -e "const t=process.arch==='arm64'?'linux-arm64-openssl-3.0.x':'debian-openssl-3.0.x';require('fs').accessSync('node_modules/.prisma/client/libquery_engine-'+t+'.so.node')"
COPY apps/api ./apps/api
COPY deploy/oci01b2/tsconfig.api-build.json ./deploy/oci01b2/tsconfig.api-build.json
# Explicit rootDir retains dist/src layout without shipping tests in the context.
RUN cd apps/api && ../../node_modules/.bin/nest build --path ../../deploy/oci01b2/tsconfig.api-build.json \
    && node dist/src/modules/lesson-preview/validate-build.js
RUN test -f apps/api/dist/src/main.js \
    && node -e "const p=require('@prisma/client/package.json');if(p.version!=='6.19.3')process.exit(1)"

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

# Separate one-shot tool image: never used as the API runtime.
FROM base AS migrate
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 HOME=/tmp
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node deploy/oci01b2/runtime.cjs ./packaging/runtime.cjs
USER node
ENTRYPOINT ["node", "/app/packaging/runtime.cjs"]
CMD ["migrate"]

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
# Explicit copy protects generated client from pruning implementation differences.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/apps/api/dist/src ./apps/api/dist/src
COPY --chown=node:node deploy/oci01b2/runtime.cjs deploy/oci01b2/healthcheck.cjs ./packaging/
RUN test ! -e /app/apps/api/dist/test && test ! -e /app/.env
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 CMD ["node", "/app/packaging/healthcheck.cjs"]
ENTRYPOINT ["node", "/app/packaging/runtime.cjs"]
CMD ["api"]
