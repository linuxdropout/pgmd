import { z } from 'zod'

export const DEFAULT_APP_TITLE = 'pgmd'
export const API_PREFIX = '/api/v1'
export const WS_PATH = '/ws'
export const DEFAULT_PG_NOTIFICATION_CHANNEL = 'document_events'

export const executionStatusSchema = z.enum(['queued', 'running', 'completed', 'failed'])
export type ExecutionStatus = z.infer<typeof executionStatusSchema>

export const sqlBlockInputSchema = z.object({
  id: z.string().trim().min(1),
  sql: z.string().trim().min(1),
})
export type SqlBlockInput = z.infer<typeof sqlBlockInputSchema>

export const parseSqlRequestSchema = z.object({
  sql: z.string().trim().min(1),
})
export type ParseSqlRequest = z.infer<typeof parseSqlRequestSchema>

export const parseSqlResponseSchema = z.object({
  statementCount: z.number().int().nonnegative(),
  dependencies: z.array(z.number().int().positive()),
  ast: z.unknown(),
})
export type ParseSqlResponse = z.infer<typeof parseSqlResponseSchema>

export const documentPlanRequestSchema = z.object({
  documentId: z.string().trim().min(1),
  blocks: z.array(sqlBlockInputSchema).min(1),
})
export type DocumentPlanRequest = z.infer<typeof documentPlanRequestSchema>

export const plannedBlockSchema = z.object({
  id: z.string(),
  position: z.number().int().positive(),
  materializedTableName: z.string(),
  statementCount: z.number().int().nonnegative(),
  dependencies: z.array(z.number().int().positive()),
  invalidDependencies: z.array(z.number().int().positive()),
  parseError: z.string().optional(),
})
export type PlannedBlock = z.infer<typeof plannedBlockSchema>

export const documentPlanResponseSchema = z.object({
  documentId: z.string(),
  topologicalOrder: z.array(z.number().int().positive()),
  hasErrors: z.boolean(),
  blocks: z.array(plannedBlockSchema),
})
export type DocumentPlanResponse = z.infer<typeof documentPlanResponseSchema>

export const executionUpdatePayloadSchema = z.object({
  documentId: z.string().trim().min(1),
  blockId: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  status: executionStatusSchema,
  changedAt: z.iso.datetime(),
  detail: z.string().optional(),
})
export type ExecutionUpdatePayload = z.infer<typeof executionUpdatePayloadSchema>

export const clientWsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('subscribe.document'),
    documentId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('unsubscribe.document'),
    documentId: z.string().trim().min(1),
  }),
])
export type ClientWsMessage = z.infer<typeof clientWsMessageSchema>

export const serverWsMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('server.ready'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('server.pong'),
  }),
  z.object({
    type: z.literal('server.error'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('server.subscription.changed'),
    documentId: z.string(),
    subscribed: z.boolean(),
  }),
  z.object({
    type: z.literal('execution.updated'),
    payload: executionUpdatePayloadSchema,
  }),
])
export type ServerWsMessage = z.infer<typeof serverWsMessageSchema>
