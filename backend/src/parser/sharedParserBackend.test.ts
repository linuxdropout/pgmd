import { parseSql } from '@pgmd/parsing'
import { describe, expect, test } from 'vitest'

describe('shared parser in backend runtime', () => {
  test('parses a query and returns statement metadata', async () => {
    const parsed = await parseSql('select 1 as one')

    expect(parsed.statementCount).toBe(1)
    expect(parsed.ast).toBeDefined()
  })
})
