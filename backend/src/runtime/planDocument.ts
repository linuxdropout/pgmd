import {
  createMaterializedTableName,
  documentPlanResponseSchema,
  extractBlockReferences,
  type DocumentPlanRequest,
  type DocumentPlanResponse,
} from '@pgmd/shared'
import { SqlParseError, type SqlParser } from '../parser/pgsqlParser.js'

const toParseErrorMessage = (error: unknown): string => {
  if (error instanceof SqlParseError) {
    return error.position === null
      ? error.message
      : `${error.message} at position ${error.position}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown SQL parse error'
}

export const planDocument = async (
  input: DocumentPlanRequest,
  sqlParser: SqlParser,
): Promise<DocumentPlanResponse> => {
  const blockCount = input.blocks.length

  const plannedBlocks = await Promise.all(
    input.blocks.map(async (block, index) => {
      const position = index + 1
      const dependencies = extractBlockReferences(block.sql)
      const invalidDependencies = dependencies.filter(
        (dependency) => dependency >= position || dependency > blockCount,
      )

      try {
        const parsed = await sqlParser.parse(block.sql)

        return {
          id: block.id,
          position,
          materializedTableName: createMaterializedTableName(input.documentId, position),
          statementCount: parsed.statementCount,
          dependencies,
          invalidDependencies,
        }
      } catch (error) {
        return {
          id: block.id,
          position,
          materializedTableName: createMaterializedTableName(input.documentId, position),
          statementCount: 0,
          dependencies,
          invalidDependencies,
          parseError: toParseErrorMessage(error),
        }
      }
    }),
  )

  return documentPlanResponseSchema.parse({
    documentId: input.documentId,
    topologicalOrder: plannedBlocks.map((block) => block.position),
    hasErrors: plannedBlocks.some(
      (block) => block.invalidDependencies.length > 0 || block.parseError !== undefined,
    ),
    blocks: plannedBlocks,
  })
}
