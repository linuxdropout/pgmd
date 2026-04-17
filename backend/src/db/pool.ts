import type { AppEnv } from '../config/env.js'
import { Pool } from 'pg'

export const createPgPool = (appEnv: AppEnv): Pool =>
  new Pool({
    connectionString: appEnv.DATABASE_URL,
    max: appEnv.PG_POOL_MAX,
  })
