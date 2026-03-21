import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  AUTH_COOKIE_VALUE: z.string().min(8).optional(),
});

type Env = z.infer<typeof envSchema>;

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
  return getEnv()[key];
}
