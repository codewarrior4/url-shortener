# syntax=docker/dockerfile:1
FROM node:24-bookworm AS build
WORKDIR /app
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/container-healthcheck.mjs ./scripts/container-healthcheck.mjs
COPY --chown=node:node scripts/container-smoke.mjs ./scripts/container-smoke.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["node", "scripts/container-healthcheck.mjs"]
CMD ["node", "dist/main.js"]
