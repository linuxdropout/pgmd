import { SqlOptimisationError } from '../errors.js'
import { parseSql } from '../parseSql.js'
import { buildSqlFromCacheTree } from './buildSql.js'
import { decomposeSqlToCacheTree } from './decompose.js'
import { normalizeSql, sanitizeCtePrefix } from './sqlText.js'
import type {
  OptimizeSqlToCacheTreeOptions,
  OptimizedSqlToCacheTreeResult,
} from './types.js'

export const optimizeSqlToCacheTree = async (
  sql: string,
  options: OptimizeSqlToCacheTreeOptions = {},
): Promise<OptimizedSqlToCacheTreeResult> => {
  const normalizedSql = normalizeSql(sql)

  if (normalizedSql.length === 0) {
    throw new SqlOptimisationError('SQL input cannot be empty.')
  }

  const parsed = await parseSql(normalizedSql)

  if (parsed.statementCount !== 1) {
    throw new SqlOptimisationError('Only single-statement SQL queries can be optimised.')
  }

  const ctePrefix = sanitizeCtePrefix(options.ctePrefix ?? 'cache')
  const decomposition = await decomposeSqlToCacheTree(parsed.ast, ctePrefix)
  const optimizedSql = buildSqlFromCacheTree(decomposition.nodes, decomposition.rootNodeId)

  return {
    originalSql: normalizedSql,
    optimizedSql,
    statementCount: parsed.statementCount,
    cacheTree: {
      rootNodeId: decomposition.rootNodeId,
      nodes: decomposition.nodes,
    },
    warnings: decomposition.warnings,
  }
}

export const optimiseSqlToCacheTree = optimizeSqlToCacheTree
