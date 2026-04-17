import { WS_PATH } from '@pgmd/shared'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import { env } from './config/env.js'
import { createPgPool } from './db/pool.js'
import { createSqlParser } from './parser/pgsqlParser.js'
import { registerApiRoutes } from './routes/api.js'
import { createWsHub } from './ws/hub.js'
import { createPgNotificationBridge } from './ws/pgNotificationBridge.js'

export const buildServer = async () => {
  const app = Fastify({ logger: true })
  const pool = createPgPool(env)
  const sqlParser = createSqlParser()
  const wsHub = createWsHub()

  await app.register(websocket)
  registerApiRoutes(app, { pool, sqlParser })

  app.get(WS_PATH, { websocket: true }, (socket) => {
    wsHub.onOpen(socket)

    socket.on('message', (raw) => {
      wsHub.onMessage(socket, raw)
    })

    socket.on('close', () => {
      wsHub.onClose(socket)
    })

    socket.on('error', () => {
      wsHub.onClose(socket)
    })
  })

  const pgNotificationBridge = createPgNotificationBridge({
    databaseUrl: env.DATABASE_URL,
    notificationChannel: env.PG_NOTIFICATION_CHANNEL,
    onExecutionUpdate: (payload) => {
      wsHub.broadcastExecutionUpdate(payload)
    },
    onError: (error) => {
      app.log.error(error)
    },
  })

  await pgNotificationBridge.start()

  app.addHook('onClose', async () => {
    await pgNotificationBridge.stop()
    await pool.end()
  })

  return app
}
