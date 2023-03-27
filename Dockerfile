FROM node:18-alpine as builder
WORKDIR /app
COPY . .
RUN yarn install
RUN yarn build

FROM node:18-alpine
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
COPY --from=builder /app/packages/back/nestjs-core-template/dist/. packages/back/nestjs-core-template/dist
EXPOSE 8080 
CMD ["/bin/sh", "-c", "node /app/dist/main"]