import { PgParser } from '@supabase/pg-parser'
import { unwrapDeparseResult } from '@supabase/pg-parser'
import type { ParseResult17, RawStmt, SelectStmt } from '@supabase/pg-parser/17/types'
import { SqlParseError } from './errors.js'

const parser = new PgParser({ version: 17 })
const parserAstVersion = 170004

const readStatementCount = (tree: unknown): number => {
  if (typeof tree !== 'object' || tree === null) {
    return 0
  }

  const maybeStatements = (tree as { stmts?: unknown }).stmts

  return Array.isArray(maybeStatements) ? maybeStatements.length : 0
}

export interface ParsedSqlResult {
  ast: ParseResult17
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

export const deparseSqlAst = async (ast: ParseResult17): Promise<string> =>
  unwrapDeparseResult(parser.deparse(ast))

export const deparseSelectStatement = async (selectStatement: SelectStmt): Promise<string> =>
  deparseSqlAst({
    version: parserAstVersion,
    stmts: [
      {
        stmt: {
          SelectStmt: selectStatement,
        },
      } as RawStmt,
    ],
  })
