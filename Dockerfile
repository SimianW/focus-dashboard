# The Docker Hub mirror on the deploy host has returned corrupt Node manifests;
# ECR serves the same official images.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:24-alpine

FROM ${NODE_IMAGE} AS web
RUN corepack enable
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE}
ENV NODE_ENV=production DATA_DIR=/data STATIC_DIR=/app/web/dist PORT=3000
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./server/
COPY --from=web /app/web/dist ./web/dist
RUN rm -f server/*.test.ts server/tsconfig.json && mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.ts"]
