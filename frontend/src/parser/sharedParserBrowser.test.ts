/* @vitest-environment jsdom */

import { optimiseSqlToCacheTree, parseSql } from '@pgmd/parsing'
import { describe, expect, test } from 'vitest'

describe('shared parser in browser runtime', () => {
  test('parses SQL from a jsdom test environment', async () => {
    expect(window).toBeDefined()

    const parsed = await parseSql('select 42 as answer')

    expect(parsed.statementCount).toBe(1)
    expect(parsed.ast).toBeDefined()
  })

  test('keeps ORDER BY in core stage when query uses qualified identifiers', async () => {
    const optimized = await optimiseSqlToCacheTree(
      'select o.id from orders o order by o.created_at desc limit 3',
    )

    expect(optimized.cacheTree.nodes.map((node) => node.kind)).toEqual(['core', 'limited'])
    expect(optimized.warnings[0]).toContain('ORDER BY')
  })

  test('decomposes monthly conversation depth into keysets and rollups', async () => {
    const optimized = await optimiseSqlToCacheTree(
      `select
        date_trunc('month', c.created_at) as month,
        c.id as chat_id,
        count(cm.id) as message_count
      from chats c
      left join chat_messages cm on cm.chat_id = c.id
      where c.created_at >= now() - interval '1 year'
      group by 1, 2
      order by 1`,
    )

    expect(optimized.cacheTree.nodes.map((node) => node.kind)).toEqual([
      'keyset',
      'joined',
      'hydrate',
      'rollup',
      'ordered',
    ])
    expect(optimized.optimizedSql).toContain('cache_keyset_c as')
    expect(optimized.optimizedSql).toContain('cache_joined_keys as')
    expect(optimized.optimizedSql).toContain('dim_1 AS month')
    expect(optimized.optimizedSql).toContain('dim_2 AS chat_id')
    expect(optimized.optimizedSql).toContain('count(agg_input_1) AS message_count')
  })
})
