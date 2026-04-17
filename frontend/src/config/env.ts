import { parseAppEnv } from './envSchema'

export const appEnv = parseAppEnv(import.meta.env)
