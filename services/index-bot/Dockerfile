FROM node:22-alpine

LABEL org.opencontainers.image.source=https://github.com/m0-foundation/solana-m
LABEL org.opencontainers.image.description="Index Bot"

WORKDIR /app

COPY *.json ./
COPY pnpm-*.yaml ./
COPY ./services/index-bot ./services/index-bot
COPY ./services/shared ./services/shared
COPY ./sdk ./sdk

RUN npm install -g pnpm ts-node && pnpm install --prod
RUN pnpm cache delete
RUN npm cache clean --force

ARG now
ENV NODE_ENV=production
ENV BUILD_TIME=$now

CMD ["sh", "-c", "ts-node ./services/index-bot/main.ts push"]
