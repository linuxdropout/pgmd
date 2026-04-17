import { optimiseSqlToCacheTree, parseSql } from '@pgmd/parsing'
import { describe, expect, test } from 'vitest'

describe('shared parser in backend runtime', () => {
  test('parses a query and returns statement metadata', async () => {
    const parsed = await parseSql('select 1 as one')

    expect(parsed.statementCount).toBe(1)
    expect(parsed.ast).toBeDefined()
  })

  test('decomposes filtered aggregations into reusable CTE stages', async () => {
    const optimized = await optimiseSqlToCacheTree(
      `select
        date_trunc('day', cm.created_at) as day,
        count(distinct cm.user_id) as dau
      from chat_messages cm
      where cm.created_at >= now() - interval '1 year'
      group by 1
      order by 1`,
    )

    expect(optimized.cacheTree.nodes.map((node) => node.kind)).toEqual([
      'keyset',
      'joined',
      'hydrate',
      'rollup',
      'ordered',
    ])
    expect(optimized.optimizedSql).toContain('cache_keyset_cm as')
    expect(optimized.optimizedSql).toContain('cache_hydrate_rows as')
    expect(optimized.optimizedSql).toContain("cm.created_at >= (now() - '1 year'::interval)")
    expect(optimized.optimizedSql).toContain('count(DISTINCT agg_input_1) AS dau')
  })

  test('keeps simple decomposition for non-aggregate queries', async () => {
    const optimized = await optimiseSqlToCacheTree(
      'select id, amount from orders where amount > 10 order by amount desc limit 5',
    )

    expect(optimized.cacheTree.nodes.map((node) => node.kind)).toEqual([
      'core',
      'ordered',
      'limited',
    ])
    expect(optimized.optimizedSql).toContain('cache_core_rows as')
    expect(optimized.optimizedSql).toContain('select * from cache_limited_rows')
  })
})
