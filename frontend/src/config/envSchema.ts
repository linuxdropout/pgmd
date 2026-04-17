import { DEFAULT_APP_TITLE } from '@pgmd/shared'
import { z } from 'zod'

const appEnvSchema = z.object({
  VITE_APP_TITLE: z.string().trim().min(1).default(DEFAULT_APP_TITLE),
})

export const parseAppEnv = (input: unknown) => appEnvSchema.parse(input)
