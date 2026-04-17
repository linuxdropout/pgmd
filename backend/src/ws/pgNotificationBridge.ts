import { executionUpdatePayloadSchema } from '@pgmd/shared'
import { Client } from 'pg'

const validChannelPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export interface PgNotificationBridge {
  start: () => Promise<void>
  stop: () => Promise<void>
}

interface CreatePgNotificationBridgeOptions {
  databaseUrl: string
  notificationChannel: string
  onExecutionUpdate: (payload: ReturnType<typeof executionUpdatePayloadSchema.parse>) => void
  onError: (error: unknown) => void
}

export const createPgNotificationBridge = (
  options: CreatePgNotificationBridgeOptions,
): PgNotificationBridge => {
  const client = new Client({ connectionString: options.databaseUrl })

  const onNotification = (payload: string | undefined): void => {
    if (payload === undefined) {
      return
    }

    try {
      const message = executionUpdatePayloadSchema.parse(JSON.parse(payload))
      options.onExecutionUpdate(message)
    } catch (error) {
      options.onError(error)
    }
  }

  return {
    start: async () => {
      if (!validChannelPattern.test(options.notificationChannel)) {
        throw new Error('PG_NOTIFICATION_CHANNEL must be a valid PostgreSQL identifier')
      }

      client.on('error', options.onError)
      client.on('notification', (notification) => {
        onNotification(notification.payload)
      })

      await client.connect()
      await client.query(`LISTEN ${options.notificationChannel}`)
    },
    stop: async () => {
      client.removeAllListeners()
      await client.end()
    },
  }
}
