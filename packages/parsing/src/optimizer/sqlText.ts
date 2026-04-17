const sqlIdentifierSegment = /[^a-z0-9_]/g
const qualifiedIdentifierPattern = /\b[a-z_][a-z0-9_$]*\s*\.\s*[a-z_*][a-z0-9_$*]*/i

export const normalizeSql = (sql: string): string => sql.trim().replace(/;+\s*$/u, '')

export const sanitizeCtePrefix = (input: string): string => {
  const sanitized = input
    .trim()
    .toLowerCase()
    .replace(sqlIdentifierSegment, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized.length > 0 ? sanitized : 'cache'
}

export const containsQualifiedIdentifier = (sqlClause: string): boolean =>
  qualifiedIdentifierPattern.test(sqlClause)

export const indentSql = (sql: string, indentation = 2): string => {
  const prefix = ' '.repeat(indentation)

  return sql
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}
