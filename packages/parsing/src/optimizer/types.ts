export type CacheTreeNodeKind =
  | 'core'
  | 'keyset'
  | 'source'
  | 'joined'
  | 'hydrate'
  | 'filtered'
  | 'rollup'
  | 'aggregated'
  | 'ordered'
  | 'limited'
  | 'passthrough'

export interface CacheTreeNode {
  id: string
  cteName: string
  kind: CacheTreeNodeKind
  sql: string
  dependsOn: string[]
  cacheable: boolean
}

export interface QueryCacheTree {
  rootNodeId: string
  nodes: CacheTreeNode[]
}

export interface OptimizedSqlToCacheTreeResult {
  originalSql: string
  optimizedSql: string
  statementCount: number
  cacheTree: QueryCacheTree
  warnings: string[]
}

export interface OptimizeSqlToCacheTreeOptions {
  ctePrefix?: string
}
