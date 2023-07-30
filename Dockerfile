FROM --platform=linux/amd64 node:18-bullseye-slim as builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN --mount=type=cache,mode=0777,target=/root/.yarn yarn install --frozen-lockfile
COPY . .
RUN yarn build:prod

FROM --platform=linux/amd64 node:18-bullseye-slim
RUN apt-get update && apt-get install -y \
    sqlite3 \
    ffmpeg \
    libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*
ENV LD_PRELOAD="/usr/lib/x86_64-linux-gnu/libjemalloc.so.2"
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV
ARG DATABASE_URL="file:../db/msfiles.db"
ENV DATABASE_URL=$DATABASE_URL
WORKDIR /app

COPY package.json yarn.lock ./
RUN --mount=type=cache,mode=0777,target=/root/.yarn yarn install --production --frozen-lockfile

COPY . .
COPY --from=builder /app/dist/. dist
EXPOSE 8080
CMD ["yarn", "start:prod"]
