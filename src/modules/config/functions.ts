import Joi from 'joi';

import { AppConfig, EnvVariables, NodeEnv, PinoLoggerLevel } from './types';
import { availableEnvBoolean, convertEnvToBoolean, splitByComma } from './utils';

/**
 * Функция для загрузки конфигурации приложения из env переменных
 *
 * При необходимости преобразовать переменную, необходимо назвать
 * ее именем отличающимся от тем который установлен в .env,
 * например, LOGGER -> LOGGER_BOOL, LOGGER_LEVELS -> LOGGER_LEVELS_ARRAY.
 * Без такого преобразования имени переменная будет выбрана из process.env
 * без преобразования значения. Это не касается строк и чисел.
 *
 * К env переменным следует относится именно как к строкам, например,
 * булевый флаг в env следует хранить как 'y' - 'n', вместо true - false.
 */
export const loadConfig = (): AppConfig => ({
  NODE_ENV: process.env.NODE_ENV as NodeEnv,
  APPLICATION_PORT: +(process.env.APPLICATION_PORT as string),
  APPLICATION_HOST: process.env.APPLICATION_HOST as string,
  APPLICATION_PREFIX: process.env.APPLICATION_PREFIX,
  BASE_URL: process.env.BASE_URL as string,
  LOGGER_BOOL: convertEnvToBoolean(process.env.LOGGER),
  LOGGER_LEVELS_ARRAY: splitByComma(process.env.LOGGER_LEVELS as string),
  PINO_LOGGER_LEVEL: (process.env.PINO_LOGGER_LEVEL as undefined | PinoLoggerLevel) ?? 'silent',
  MINIO_HOST: process.env.MINIO_HOST as string,
  MINIO_PORT: +(process.env.MINIO_PORT as string),
  MINIO_USE_SSL_BOOL: convertEnvToBoolean(process.env.MINIO_USE_SSL),
  MINIO_ROOT_USER: process.env.MINIO_ROOT_USER as string,
  MINIO_ROOT_PASSWORD: process.env.MINIO_ROOT_PASSWORD as string,
  MINIO_BUCKET: process.env.MINIO_BUCKET as string,
  MINIO_ADDITIONAL_BUCKETS_ARRAY: process.env.MINIO_ADDITIONAL_BUCKETS
    ? splitByComma(process.env.MINIO_ADDITIONAL_BUCKETS)
    : [],
  PUBLIC_BUCKET_EXTERNAL_URL: process.env.PUBLIC_BUCKET_EXTERNAL_URL,
  PRISMA_LOGGER_LEVELS_ARRAY: splitByComma(process.env.PRISMA_LOGGER_LEVELS ?? 'error'),
  RABBITMQ_USER: process.env.RABBITMQ_USER as string,
  RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD as string,
  RABBITMQ_HOST: process.env.RABBITMQ_HOST as string,
  RABBITMQ_PORT: +(process.env.RABBITMQ_PORT as string),
  RABBITMQ_MSFILES_EXCHANGE: process.env.RABBITMQ_MSFILES_EXCHANGE as string,
  RABBITMQ_CONSUMER_EXCHANGE: process.env.RABBITMQ_CONSUMER_EXCHANGE as string,
  IS_SWAGGER_ENABLED_BOOL: convertEnvToBoolean(process.env.IS_SWAGGER_ENABLED),
  DATABASE_URL: process.env.DATABASE_URL as string,
  THUMBNAIL_SIZES: process.env.THUMBNAIL_SIZES ?? '300x300::inside',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD as string,
  REDIS_PORT: process.env.REDIS_PORT as string,
  REDIS_HOST: process.env.REDIS_HOST as string,
  CORS_ORIGINS_ARRAY: process.env.CORS_ORIGINS ? splitByComma(process.env.CORS_ORIGINS) : undefined,
});

/**
 * Функция валидирует переданные env переменные с помощью Joi схемы
 */
export const validationEnvSchema = Joi.object<EnvVariables, true>({
  NODE_ENV: Joi.string().required().valid('production', 'development').label('NODE_ENV'),
  APPLICATION_PORT: Joi.number().integer().positive().label('APPLICATION_PORT'),
  APPLICATION_HOST: Joi.string().required().label('APPLICATION_HOST'),
  APPLICATION_PREFIX: Joi.string().optional().label('APPLICATION_PREFIX'),
  BASE_URL: Joi.string().required().uri().label('BASE_URL'),
  LOGGER: Joi.string()
    .required()
    .valid(...availableEnvBoolean)
    .label('LOGGER'),
  LOGGER_LEVELS: Joi.string().optional().label('LOGGER_LEVELS'),
  PINO_LOGGER_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .optional()
    .label('PINO_LOGGER_LEVEL'),
  PRISMA_LOGGER_LEVELS: Joi.string().optional().label('PRISMA_LOGGER_LEVELS'),
  MINIO_HOST: Joi.string().required().label('MINIO_HOST'),
  MINIO_PORT: Joi.number().integer().positive().required().label('MINIO_PORT'),
  MINIO_USE_SSL: Joi.string()
    .required()
    .valid(...availableEnvBoolean)
    .label('MINIO_USE_SSL'),
  MINIO_ROOT_USER: Joi.string().required().label('MINIO_ROOT_USER'),
  MINIO_ROOT_PASSWORD: Joi.string().required().label('MINIO_ROOT_PASSWORD'),
  MINIO_BUCKET: Joi.string().required().label('MINIO_BUCKET'),
  MINIO_ADDITIONAL_BUCKETS: Joi.string().optional().label('MINIO_ADDITIONAL_BUCKETS'),
  PUBLIC_BUCKET_EXTERNAL_URL: Joi.string().optional().label('PUBLIC_BUCKET_EXTERNAL_URL'),
  DATABASE_URL: Joi.string().required().label('DATABASE_URL'),
  RABBITMQ_USER: Joi.string().required().label('RABBITMQ_USER'),
  RABBITMQ_PASSWORD: Joi.string().required().label('RABBITMQ_PASSWORD'),
  RABBITMQ_HOST: Joi.string().required().label('RABBITMQ_HOST'),
  RABBITMQ_PORT: Joi.number().required().label('RABBITMQ_PORT'),
  RABBITMQ_MSFILES_EXCHANGE: Joi.string().required().label('RABBITMQ_MSFILES_EXCHANGE'),
  RABBITMQ_CONSUMER_EXCHANGE: Joi.string().required().label('RABBITMQ_CONSUMER_EXCHANGE'),
  IS_SWAGGER_ENABLED: Joi.string()
    .required()
    .valid(...availableEnvBoolean)
    .label('IS_SWAGGER_ENABLED'),
  THUMBNAIL_SIZES: Joi.string().optional().label('THUMBNAIL_SIZES'),
  REDIS_PASSWORD: Joi.string().required().label('REDIS_PASSWORD'),
  REDIS_PORT: Joi.string().required().label('REDIS_PORT'),
  REDIS_HOST: Joi.string().required().label('REDIS_HOST'),
  CORS_ORIGINS: Joi.string().optional().label('CORS_ORIGINS'),
});
