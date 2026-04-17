import { describe, expect, test } from 'vitest'
import type { SqlParser } from '../parser/pgsqlParser.js'
import { planDocument } from './planDocument.js'

const noOpParser: SqlParser = {
  parse: () =>
    Promise.resolve({
      ast: {},
      statementCount: 1,
    }),
}

describe('planDocument', () => {
  test('extracts block dependencies and validates forward refs', async () => {
    const plan = await planDocument(
      {
        documentId: 'sales-overview',
        blocks: [
          { id: 'b1', sql: 'select * from orders' },
          { id: 'b2', sql: 'select * from ref:1 where amount > 100' },
          { id: 'b3', sql: 'select * from ref:4' },
        ],
      },
      noOpParser,
    )

    expect(plan.blocks[1]?.dependencies).toEqual([1])
    expect(plan.blocks[1]?.invalidDependencies).toEqual([])
    expect(plan.blocks[2]?.dependencies).toEqual([4])
    expect(plan.blocks[2]?.invalidDependencies).toEqual([4])
    expect(plan.hasErrors).toBe(true)
  })

  test('marks parser failures as block-level parse errors', async () => {
    const parserWithFailure: SqlParser = {
      parse: (sql) => {
        if (sql.includes('broken')) {
          return Promise.reject(new Error('syntax error'))
        }

        return Promise.resolve({
          ast: {},
          statementCount: 1,
        })
      },
    }

    const plan = await planDocument(
      {
        documentId: 'docs',
        blocks: [
          { id: 'b1', sql: 'select 1' },
          { id: 'b2', sql: 'broken sql' },
        ],
      },
      parserWithFailure,
    )

    expect(plan.blocks[0]?.parseError).toBeUndefined()
    expect(plan.blocks[1]?.parseError).toContain('syntax error')
    expect(plan.hasErrors).toBe(true)
  })
})
