const wordBoundaryPattern = /[a-z0-9_$]/i

const asMaskCharacter = (character: string): string =>
  character === '\n' || character === '\r' || character === '\t' ? character : ' '

const isWordBoundary = (character: string | undefined): boolean =>
  character === undefined || !wordBoundaryPattern.test(character)

const readDollarQuoteTag = (sql: string, startIndex: number): string | null => {
  if (sql[startIndex] !== '$') {
    return null
  }

  let cursor = startIndex + 1

  while (cursor < sql.length) {
    const current = sql[cursor]

    if (current === '$') {
      return sql.slice(startIndex, cursor + 1)
    }

    if (current === undefined || !/[a-z0-9_]/i.test(current)) {
      return null
    }

    cursor += 1
  }

  return null
}

export const maskNonTopLevelSql = (sql: string): string => {
  const masked = Array.from(sql)
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false
  let inDollarQuoteTag: string | null = null

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index]
    const next = sql[index + 1]

    if (current === undefined) {
      continue
    }

    if (inLineComment) {
      masked[index] = asMaskCharacter(current)

      if (current === '\n') {
        inLineComment = false
      }

      continue
    }

    if (inBlockComment) {
      masked[index] = asMaskCharacter(current)

      if (current === '*' && next === '/') {
        masked[index + 1] = asMaskCharacter('/')
        inBlockComment = false
        index += 1
      }

      continue
    }

    if (inSingleQuote) {
      masked[index] = asMaskCharacter(current)

      if (current === "'" && next === "'") {
        masked[index + 1] = asMaskCharacter("'")
        index += 1
        continue
      }

      if (current === "'") {
        inSingleQuote = false
      }

      continue
    }

    if (inDoubleQuote) {
      masked[index] = asMaskCharacter(current)

      if (current === '"' && next === '"') {
        masked[index + 1] = asMaskCharacter('"')
        index += 1
        continue
      }

      if (current === '"') {
        inDoubleQuote = false
      }

      continue
    }

    if (inDollarQuoteTag !== null) {
      masked[index] = asMaskCharacter(current)

      if (sql.startsWith(inDollarQuoteTag, index)) {
        for (let cursor = 0; cursor < inDollarQuoteTag.length; cursor += 1) {
          masked[index + cursor] = asMaskCharacter(sql[index + cursor] ?? ' ')
        }

        index += inDollarQuoteTag.length - 1
        inDollarQuoteTag = null
      }

      continue
    }

    if (current === '-' && next === '-') {
      masked[index] = asMaskCharacter(current)
      masked[index + 1] = asMaskCharacter(next)
      inLineComment = true
      index += 1
      continue
    }

    if (current === '/' && next === '*') {
      masked[index] = asMaskCharacter(current)
      masked[index + 1] = asMaskCharacter(next)
      inBlockComment = true
      index += 1
      continue
    }

    if (current === "'") {
      masked[index] = asMaskCharacter(current)
      inSingleQuote = true
      continue
    }

    if (current === '"') {
      masked[index] = asMaskCharacter(current)
      inDoubleQuote = true
      continue
    }

    const maybeDollarQuoteTag = readDollarQuoteTag(sql, index)

    if (maybeDollarQuoteTag !== null) {
      for (let cursor = 0; cursor < maybeDollarQuoteTag.length; cursor += 1) {
        masked[index + cursor] = asMaskCharacter(sql[index + cursor] ?? ' ')
      }

      inDollarQuoteTag = maybeDollarQuoteTag
      index += maybeDollarQuoteTag.length - 1
      continue
    }

    if (current === '(') {
      depth += 1
      masked[index] = asMaskCharacter(current)
      continue
    }

    if (current === ')') {
      depth = Math.max(0, depth - 1)
      masked[index] = asMaskCharacter(current)
      continue
    }

    if (depth > 0) {
      masked[index] = asMaskCharacter(current)
    }
  }

  return masked.join('')
}

export const findTopLevelClauseIndex = (
  maskedSql: string,
  clausePattern: RegExp,
  startAt = 0,
): number | null => {
  const flags = clausePattern.flags.includes('g')
    ? clausePattern.flags
    : `${clausePattern.flags}g`
  const matcher = new RegExp(clausePattern.source, flags)
  matcher.lastIndex = startAt

  for (;;) {
    const result = matcher.exec(maskedSql)

    if (result === null) {
      return null
    }

    const match = result[0]
    const start = result.index
    const end = start + match.length
    const before = maskedSql[start - 1]
    const after = maskedSql[end]

    if (isWordBoundary(before) && isWordBoundary(after)) {
      return start
    }

    matcher.lastIndex = start + 1
  }
}
