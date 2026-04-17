import { DEFAULT_PG_NOTIFICATION_CHANNEL } from '@pgmd/shared'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().trim().min(1),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),
  PG_NOTIFICATION_CHANNEL: z.string().trim().min(1).default(DEFAULT_PG_NOTIFICATION_CHANNEL),
})

export type AppEnv = z.infer<typeof envSchema>

export const env = envSchema.parse(process.env)
