import { env } from './config/env.js'
import { buildServer } from './app.js'

const start = async (): Promise<void> => {
  const server = await buildServer()

  try {
    await server.listen({
      host: env.HOST,
      port: env.PORT,
    })
  } catch (error) {
    server.log.error(error)
    process.exit(1)
  }
}

void start()
