import Joi from 'joi';

export const environmentSchema = Joi.object({
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://127.0.0.1:6379/0'),
  QUEUE_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('url-shortener'),
  NOTIFICATION_ENCRYPTION_KEY: Joi.string()
    .pattern(/^[a-f0-9]{64}$/i)
    .required(),
  JWT_SECRET: Joi.string().min(32).required(),
  APP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(2525),
  SMTP_USER: Joi.string().required(),
  SMTP_PASSWORD: Joi.string().required(),
  MAIL_FROM: Joi.string()
    .email({ tlds: { allow: false } })
    .required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
});
