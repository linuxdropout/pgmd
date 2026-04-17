import { parseSql, type ParsedSqlResult } from '@pgmd/parsing'

export { SqlParseError, type ParsedSqlResult } from '@pgmd/parsing'

export interface SqlParser {
  parse: (sql: string) => Promise<ParsedSqlResult>
}

export const createSqlParser = (): SqlParser => ({
  parse: parseSql,
})
