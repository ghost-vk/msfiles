// Validation of env variables placed at /src/modules/config/functions.ts

export const RMQ_MSFILES_EXCHANGE = process.env.RABBITMQ_MSFILES_EXCHANGE as string;
export const RMQ_CONSUMER_EXCHANGE = process.env.RABBITMQ_CONSUMER_EXCHANGE as string;

export const MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB ? +process.env.MAX_FILE_SIZE_MB : 5;
export const MAX_IMAGE_SIZE_MB = process.env.MAX_IMAGE_SIZE_MB ? +process.env.MAX_IMAGE_SIZE_MB : 5;
export const MAX_VIDEO_SIZE_MB = process.env.MAX_VIDEO_SIZE_MB ? +process.env.MAX_VIDEO_SIZE_MB : 10;
