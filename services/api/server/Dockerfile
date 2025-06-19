# syntax=docker.io/docker/dockerfile:1.7-labs

## build stage
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY *.yaml ./
COPY --exclude=node_modules services/api/server/ services/api/server/

RUN npm install -g pnpm && \
    pnpm install && \
    pnpm --filter "solana-m-api" build

## production stage
FROM node:24-alpine AS final
WORKDIR /app

COPY --from=build /app/package.json /app/
COPY --from=build /app/*.yaml /app/
COPY --from=build /app/services/api/server /app/services/api/server

RUN npm install -g pnpm && \
    pnpm install --prod && \
    npm cache clean --force && \
    pnpm store prune
    
EXPOSE 5500

CMD ["node", "services/api/server/dist/server.js"]
