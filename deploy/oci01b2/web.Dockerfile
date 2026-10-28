# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim
ARG NGINX_IMAGE=nginx:stable-bookworm
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN node -e "if(process.platform!=='linux'||!['arm64','x64'].includes(process.arch)||process.versions.node.split('.')[0]!=='22')process.exit(1)"
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --no-audit --no-fund
COPY apps/web ./apps/web
# Fixed public path, NOT a secret or arbitrary environment projection.
RUN VITE_API_BASE_URL=/api npm run build -w @clp/web

FROM ${NGINX_IMAGE} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/oci01b2/nginx.conf /etc/nginx/nginx.conf
COPY deploy/oci01b2/http.conf /etc/nginx/conf.d/default.conf
COPY deploy/oci01b2/locations.conf /etc/nginx/clp-locations.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080 8443
# Bypass base entrypoint scripts that try rewriting readonly /etc/nginx.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
