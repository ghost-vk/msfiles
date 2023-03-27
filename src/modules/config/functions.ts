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
  PRISMA_LOGGER_LEVELS_ARRAY: splitByComma(process.env.PRISMA_LOGGER_LEVELS ?? 'error'),
  JWT_SECRET: process.env.JWT_SECRET as string,
  RABBITMQ_USER: process.env.RABBITMQ_USER as string,
  RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD as string,
  RABBITMQ_HOST: process.env.RABBITMQ_HOST as string,
  RABBITMQ_PORT: +(process.env.RABBITMQ_PORT as string),
  RABBITMQ_QUEUE_NAME: process.env.RABBITMQ_QUEUE_NAME as string,
  IS_SWAGGER_ENABLED_BOOL: convertEnvToBoolean(process.env.IS_SWAGGER_ENABLED),
  POSTGRES_PORT: +(process.env.POSTGRES_PORT as string),
  POSTGRES_HOST: process.env.POSTGRES_HOST as string,
  POSTGRES_USER: process.env.POSTGRES_USER as string,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD as string, 
  POSTGRES_DB: process.env.POSTGRES_DB as string,
  DATABASE_URL: process.env.DATABASE_URL as string,
});

/**
 * Функция валидирует переданные env переменные с помощью Joi схемы
 */
export const validationEnvSchema = Joi.object<EnvVariables, true>({
  NODE_ENV: Joi.string().required().valid('production', 'development').label('NODE_ENV'),
  APPLICATION_PORT: Joi.number().integer().positive().label('APPLICATION_PORT'),
  APPLICATION_HOST: Joi.string().required().label('APPLICATION_HOST'),
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
  DATABASE_URL: Joi.string().required().label('DATABASE_URL'),
  PRISMA_LOGGER_LEVELS: Joi.string().optional().label('PRISMA_LOGGER_LEVELS'),
  JWT_SECRET: Joi.string().required().label('JWT_SECRET'),
  RABBITMQ_USER: Joi.string().required().label('RABBITMQ_USER'),
  RABBITMQ_PASSWORD: Joi.string().required().label('RABBITMQ_PASSWORD'),
  RABBITMQ_HOST: Joi.string().required().label('RABBITMQ_HOST'),
  RABBITMQ_PORT: Joi.number().required().label('RABBITMQ_PORT'),
  RABBITMQ_QUEUE_NAME: Joi.string().required().label('RABBITMQ_QUEUE_NAME'),
  IS_SWAGGER_ENABLED: Joi.string()
    .required()
    .valid(...availableEnvBoolean)
    .label('IS_SWAGGER_ENABLED'),
  POSTGRES_PORT: Joi.number().integer().positive().required().label('POSTGRES_PORT'),
  POSTGRES_USER: Joi.string().required().label('POSTGRES_USER'),
  POSTGRES_PASSWORD: Joi.string().required().label('POSTGRES_PASSWORD'),
  POSTGRES_DB: Joi.string().required().label('POSTGRES_DB'),
  POSTGRES_HOST: Joi.string().required().label('POSTGRES_HOST'),
});
