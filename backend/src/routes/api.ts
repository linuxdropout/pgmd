import {
  API_PREFIX,
  documentPlanRequestSchema,
  parseSqlRequestSchema,
  parseSqlResponseSchema,
  extractBlockReferences,
} from '@pgmd/shared'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { SqlParser } from '../parser/pgsqlParser.js'
import { planDocument } from '../runtime/planDocument.js'

interface RegisterApiRoutesOptions {
  pool: Pool
  sqlParser: SqlParser
}

export const registerApiRoutes = (
  app: FastifyInstance,
  options: RegisterApiRoutesOptions,
): void => {
  app.get(`${API_PREFIX}/health`, async () => {
    await options.pool.query('select 1')

    return {
      status: 'ok',
      service: 'pgmd-backend',
      now: new Date().toISOString(),
    }
  })

  app.post(`${API_PREFIX}/sql/parse`, async (request, reply) => {
    const parsedBody = parseSqlRequestSchema.safeParse(request.body)

    if (!parsedBody.success) {
      reply.code(400).send({
        error: 'Invalid parse request payload',
        issues: parsedBody.error.issues,
      })
      return
    }

    try {
      const parsedSql = await options.sqlParser.parse(parsedBody.data.sql)
      const response = parseSqlResponseSchema.parse({
        statementCount: parsedSql.statementCount,
        dependencies: extractBlockReferences(parsedBody.data.sql),
        ast: parsedSql.ast,
      })

      reply.send(response)
      return
    } catch (error) {
      reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to parse SQL',
      })
      return
    }
  })

  app.post(`${API_PREFIX}/documents/plan`, async (request, reply) => {
    const parsedBody = documentPlanRequestSchema.safeParse(request.body)

    if (!parsedBody.success) {
      reply.code(400).send({
        error: 'Invalid plan request payload',
        issues: parsedBody.error.issues,
      })
      return
    }

    const response = await planDocument(parsedBody.data, options.sqlParser)

    reply.send(response)
  })
}
