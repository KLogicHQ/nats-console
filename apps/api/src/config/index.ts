import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ClickHouse
  CLICKHOUSE_URL: z.string().default('http://localhost:8123'),
  CLICKHOUSE_DATABASE: z.string().default('nats_console'),
  CLICKHOUSE_USER: z.string().default('nats_console'),
  CLICKHOUSE_PASSWORD: z.string().default('nats_console_dev'),

  // NATS (internal for job queues)
  NATS_URL: z.string().default('nats://localhost:4222'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // CORS
  // Use '*' for single-container mode, comma-separated origins for multi-container
  CORS_ORIGIN: z.string().default('*'),

  // Rate limiting (only applies in production, disabled in development)
  RATE_LIMIT_MAX: z.coerce.number().default(1000), // 1000 requests per window in production
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000), // 1 minute

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('NATS Console <noreply@nats-console.local>'),

  // Frontend URL (for links in emails)
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();

export type Config = typeof config;
