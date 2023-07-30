FROM --platform=linux/amd64 node:18-bullseye-slim
RUN apt-get update && apt-get install -y \
    sqlite3 \
    ffmpeg \
    libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*
ENV LD_PRELOAD="/usr/lib/x86_64-linux-gnu/libjemalloc.so.2"
ARG NODE_ENV=test
ENV NODE_ENV $NODE_ENV
WORKDIR /app

COPY package.json yarn.lock ./
RUN --mount=type=cache,mode=0777,target=/root/.yarn yarn install --frozen-lockfile

COPY . .
RUN yarn build:prod
CMD ["yarn", "start:test-container"]
