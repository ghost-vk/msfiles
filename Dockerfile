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
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
COPY --from=builder /app/dist/. dist
EXPOSE 8080
CMD ["yarn", "start:prod"]
