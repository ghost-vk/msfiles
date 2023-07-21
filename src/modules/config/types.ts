export type NodeEnv = 'production' | 'development';

export type PinoLoggerLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  NODE_ENV: NodeEnv;
  APPLICATION_PORT: number;
  APPLICATION_HOST: string;
  APPLICATION_PREFIX?: string;
  BASE_URL: string;
  LOGGER_BOOL: boolean;
  LOGGER_LEVELS_ARRAY: string[];
  PINO_LOGGER_LEVEL: PinoLoggerLevel;
  MINIO_HOST: string;
  MINIO_PORT: number;
  MINIO_USE_SSL_BOOL: boolean;
  MINIO_ROOT_USER: string;
  MINIO_ROOT_PASSWORD: string;
  MINIO_BUCKET: string;
  MINIO_ADDITIONAL_BUCKETS_ARRAY: string[];
  PUBLIC_BUCKET_EXTERNAL_URL?: string;
  PRISMA_LOGGER_LEVELS_ARRAY: string[];
  RABBITMQ_USER: string;
  RABBITMQ_PASSWORD: string;
  RABBITMQ_HOST: string;
  RABBITMQ_PORT: number;
  RABBITMQ_MSFILES_EXCHANGE: string;
  RABBITMQ_CONSUMER_EXCHANGE: string; // Send the upload, conversion result to the consumer's exchange
  IS_SWAGGER_ENABLED_BOOL: boolean;
  DATABASE_URL: string;
  THUMBNAIL_SIZES: string;
  REDIS_PASSWORD: string;
  REDIS_PORT: string;
  REDIS_HOST: string;
}

export type EnvBoolean = 'y' | 'n';

export interface EnvVariables {
  NODE_ENV: NodeEnv;
  APPLICATION_PORT: number;
  APPLICATION_HOST: string;
  APPLICATION_PREFIX?: string;
  BASE_URL: string;
  LOGGER: EnvBoolean;
  LOGGER_LEVELS: string;
  PINO_LOGGER_LEVEL?: string;
  MINIO_HOST: string;
  MINIO_PORT: number;
  MINIO_USE_SSL: EnvBoolean;
  MINIO_ROOT_USER: string;
  MINIO_ROOT_PASSWORD: string;
  MINIO_BUCKET: string;
  MINIO_ADDITIONAL_BUCKETS?: string;
  PUBLIC_BUCKET_EXTERNAL_URL?: string;
  PRISMA_LOGGER_LEVELS: string;
  RABBITMQ_USER: string;
  RABBITMQ_PASSWORD: string;
  RABBITMQ_HOST: string;
  RABBITMQ_PORT: number;
  RABBITMQ_MSFILES_EXCHANGE: string;
  RABBITMQ_CONSUMER_EXCHANGE: string;
  IS_SWAGGER_ENABLED: EnvBoolean;
  DATABASE_URL: string;
  THUMBNAIL_SIZES: string;
  REDIS_PASSWORD: string;
  REDIS_PORT: string;
  REDIS_HOST: string;
}
