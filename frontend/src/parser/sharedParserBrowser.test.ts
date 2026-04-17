/* @vitest-environment jsdom */

import { parseSql } from '@pgmd/parsing'
import { describe, expect, test } from 'vitest'

describe('shared parser in browser runtime', () => {
  test('parses SQL from a jsdom test environment', async () => {
    expect(window).toBeDefined()

    const parsed = await parseSql('select 42 as answer')

    expect(parsed.statementCount).toBe(1)
    expect(parsed.ast).toBeDefined()
  })
})
