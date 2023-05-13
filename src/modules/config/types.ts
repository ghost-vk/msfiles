export type NodeEnv = 'production' | 'development';

export type PinoLoggerLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  NODE_ENV: NodeEnv;
  APPLICATION_PORT: number;
  APPLICATION_HOST: string;
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
  PRISMA_LOGGER_LEVELS_ARRAY: string[];
  JWT_SECRET: string;
  RABBITMQ_USER: string;
  RABBITMQ_PASSWORD: string;
  RABBITMQ_HOST: string;
  RABBITMQ_QUEUE_MSFILES: string;
  RABBITMQ_QUEUE_CORE: string;
  RABBITMQ_PORT: number;
  IS_SWAGGER_ENABLED_BOOL: boolean;
  DATABASE_URL: string;
}

export type EnvBoolean = 'y' | 'n';

export interface EnvVariables {
  NODE_ENV: NodeEnv;
  APPLICATION_PORT: number;
  APPLICATION_HOST: string;
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
  PRISMA_LOGGER_LEVELS: string;
  JWT_SECRET: string;
  RABBITMQ_USER: string;
  RABBITMQ_PASSWORD: string;
  RABBITMQ_HOST: string;
  RABBITMQ_QUEUE_MSFILES: string;
  RABBITMQ_QUEUE_CORE: string;
  RABBITMQ_PORT: number;
  IS_SWAGGER_ENABLED: EnvBoolean;
  DATABASE_URL: string;
}
