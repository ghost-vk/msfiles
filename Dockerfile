FROM --platform=linux/amd64 node:18-alpine as builder
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build:prod

FROM --platform=linux/amd64 node:18-alpine
RUN apk add --no-cache sqlite ffmpeg
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV
ARG DATABASE_URL="file:../db/msfiles.db"
ENV DATABASE_URL=$DATABASE_URL
ARG APPLICATION_PORT=8080
ENV APPLICATION_PORT=$APPLICATION_PORT
ARG APPLICATION_HOST="0.0.0.0"
ENV APPLICATION_HOST=$APPLICATION_HOST
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production

COPY . .
COPY --from=builder /app/dist/. dist
EXPOSE 8080
CMD ["yarn", "start:prod"]
