import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  AUTH_COOKIE_VALUE: z.string().min(8).optional(),
  // Borsa veri API anahtarları
  ALPHAVANTAGE_API_KEY: z.string().min(1).optional(),
  TWELVE_DATA_API_KEY: z.string().min(1).optional(),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  // Haber API anahtarları
  NEWSAPI_KEY: z.string().min(1).optional(),
  GNEWS_API_KEY: z.string().min(1).optional(),
  CURRENTS_API_KEY: z.string().min(1).optional(),
  MEDIASTACK_ACCESS_KEY: z.string().min(1).optional(),
});

type Env = z.infer<typeof envSchema>;

// Lenient schema for optional env vars (doesn't validate format, just reads)
function readEnvValue(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === "" || value === null) {
    return undefined;
  }
  return value;
}

let cache: Env | null = null;

export function getEnv(): Env {
  if (cache) {
    return cache;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Environment validation failed: ${message}`);
  }

  cache = parsed.data;
  return cache;
}

export function getOptionalEnv<K extends keyof Env>(key: K): Env[K] {
  const value = readEnvValue(key as string);
  if (value === undefined) return undefined as Env[K];
  // validate against schema
  const parsed = envSchema.shape[key].safeParse(value);
  if (!parsed.success) {
    console.warn(`Environment variable ${key} failed validation: ${parsed.error.message}`);
    return undefined as Env[K];
  }
  return parsed.data as Env[K];
}

export function getRequiredEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = readEnvValue(key as string);
  if (value === undefined || value === null) {
    throw new Error(`Required environment variable ${String(key)} is not set`);
  }
  return value as NonNullable<Env[K]>;
}
