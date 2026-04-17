import { indentSql } from './sqlText.js'
import type { CacheTreeNode } from './types.js'

const toCteClause = (node: CacheTreeNode): string =>
  `${node.cteName} as (\n${indentSql(node.sql)}\n)`

export const buildSqlFromCacheTree = (nodes: CacheTreeNode[], rootNodeId: string): string => {
  const rootNode = nodes.find((node) => node.id === rootNodeId)

  if (rootNode === undefined) {
    throw new Error(`Root cache node "${rootNodeId}" was not found.`)
  }

  const cteClauses = nodes.map(toCteClause).join(',\n')

  return `with\n${cteClauses}\nselect * from ${rootNode.cteName}`
}
