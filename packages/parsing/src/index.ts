import { PgParser } from '@supabase/pg-parser'

const parser = new PgParser({ version: 17 })

const readStatementCount = (tree: unknown): number => {
  if (typeof tree !== 'object' || tree === null) {
    return 0
  }

  const maybeStatements = (tree as { stmts?: unknown }).stmts

  return Array.isArray(maybeStatements) ? maybeStatements.length : 0
}

export class SqlParseError extends Error {
  readonly position: number | null

  constructor(message: string, position: number | null) {
    super(message)
    this.name = 'SqlParseError'
    this.position = position
  }
}

export interface ParsedSqlResult {
  ast: unknown
  statementCount: number
}

export const parseSql = async (sql: string): Promise<ParsedSqlResult> => {
  const result = await parser.parse(sql)

  if (result.error) {
    throw new SqlParseError(result.error.message, result.error.position)
  }

  return {
    ast: result.tree,
    statementCount: readStatementCount(result.tree),
  }
}
