import { DEFAULT_APP_TITLE } from '@pgmd/shared'
import { describe, expect, test } from 'vitest'
import { parseAppEnv } from './envSchema'

describe('parseAppEnv', () => {
  test('defaults VITE_APP_TITLE when not provided', () => {
    const parsed = parseAppEnv({})

    expect(parsed.VITE_APP_TITLE).toBe(DEFAULT_APP_TITLE)
  })

  test('rejects empty VITE_APP_TITLE', () => {
    expect(() => parseAppEnv({ VITE_APP_TITLE: '' })).toThrow()
  })
})
