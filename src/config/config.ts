import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define environment variables schema
const envSchema = z.object({
  // Telegram Configuration
  TELEGRAM_BOT_TOKEN: z.string(),

  // API Keys
  DUNE_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  BINANCE_API_KEY: z.string(),
  BINANCE_API_SECRET: z.string(),

  // Redis Configuration
  REDIS_URL: z.string().url(),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Google Cloud Configuration
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
});

// Parse and validate environment variables
const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 4));
  process.exit(1);
}

// Export validated config
export const config = {
  telegram: {
    botToken: env.data.TELEGRAM_BOT_TOKEN,
  },
  apis: {
    dune: {
      apiKey: env.data.DUNE_API_KEY,
    },
    openai: {
      apiKey: env.data.OPENAI_API_KEY,
    },
    binance: {
      apiKey: env.data.BINANCE_API_KEY,
      apiSecret: env.data.BINANCE_API_SECRET,
    },
  },
  redis: {
    url: env.data.REDIS_URL,
  },
  app: {
    env: env.data.NODE_ENV,
    port: env.data.PORT,
    logLevel: env.data.LOG_LEVEL,
  },
  google: {
    credentials: env.data.GOOGLE_APPLICATION_CREDENTIALS,
  },
} as const; 