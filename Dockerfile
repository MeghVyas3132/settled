# settled-api: Node 24, pnpm workspace build, non-root
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter settled-api... --filter settled-core
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter settled-core build && pnpm --filter settled-api build && pnpm deploy --filter settled-api --prod --legacy /out

FROM node:24-alpine
WORKDIR /app
COPY --from=build /out .
USER node
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "dist/server.js"]
