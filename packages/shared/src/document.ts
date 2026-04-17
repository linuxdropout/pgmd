const blockReferencePattern = /\bref:(\d+)\b/gi
const postgresIdentifierMaxLength = 63

const sanitizeIdentifierPart = (input: string): string => {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized.length > 0 ? normalized : 'doc'
}

export const extractBlockReferences = (sql: string): number[] => {
  const references = new Set<number>()

  for (const match of sql.matchAll(blockReferencePattern)) {
    const parsedReference = Number.parseInt(match[1] ?? '', 10)

    if (Number.isInteger(parsedReference) && parsedReference > 0) {
      references.add(parsedReference)
    }
  }

  return [...references].sort((a, b) => a - b)
}

export const createMaterializedTableName = (documentId: string, blockPosition: number): string => {
  if (!Number.isInteger(blockPosition) || blockPosition <= 0) {
    throw new Error('blockPosition must be a positive integer')
  }

  const sanitizedDocumentId = sanitizeIdentifierPart(documentId)
  const proposedName = `doc_${sanitizedDocumentId}_block${blockPosition}`

  return proposedName.slice(0, postgresIdentifierMaxLength)
}
