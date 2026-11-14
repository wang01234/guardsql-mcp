# ---- build stage: compile TypeScript to dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage: production dependencies + compiled output ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY config ./config
# Demo schema/seed, used by AUTO_INIT_DB to populate a fresh hosted database.
COPY db ./db

# The audit log is written to ./audit.log, so the runtime user needs write access.
RUN chown -R node:node /app

USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
