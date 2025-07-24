# syntax=docker.io/docker/dockerfile:1.7-labs

FROM node:22 AS build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy all code (include SDKs)
COPY --exclude=node_modules . ./

# Install dependencies
RUN pnpm install

# Build the app (specifically the dashboard)
WORKDIR /app/dashboard
RUN pnpm run build

# Use the Caddy image
FROM caddy

# Create and change to the app directory.
WORKDIR /app

# Copy Caddyfile to the container image.
COPY dashboard/Caddyfile ./

# Copy local code to the container image.
RUN caddy fmt Caddyfile --overwrite

# Copy files to the container image.
COPY --from=build /app/dashboard/dist ./dist

LABEL org.opencontainers.image.source https://github.com/m0-foundation/solana-m
LABEL org.opencontainers.image.description "Solana Dashboard"

# Use Caddy to run/serve the app
CMD ["caddy", "run", "--config", "Caddyfile", "--adapter", "caddyfile"]
