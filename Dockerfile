# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install && npm install --prefix server && npm install --prefix client

COPY server ./server
COPY client ./client

RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/var/data

COPY package.json ./
COPY server/package.json ./server/
RUN npm install --prefix server --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3001
VOLUME ["/var/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${PORT:-3001}/api/health || exit 1

CMD ["node", "server/dist/index.js"]
