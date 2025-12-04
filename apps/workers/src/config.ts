import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // ClickHouse
  CLICKHOUSE_URL: z.string().default('http://localhost:8123'),
  CLICKHOUSE_DATABASE: z.string().default('nats_console'),
  CLICKHOUSE_USER: z.string().default('nats_console'),
  CLICKHOUSE_PASSWORD: z.string().default('nats_console_dev'),

  // NATS
  NATS_URL: z.string().default('nats://localhost:4222'),

  // Worker settings
  METRICS_INTERVAL_MS: z.coerce.number().default(10000), // 10 seconds
  CLUSTER_METRICS_INTERVAL_MS: z.coerce.number().default(30000), // 30 seconds
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
