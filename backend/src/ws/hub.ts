import {
  clientWsMessageSchema,
  serverWsMessageSchema,
  type ExecutionUpdatePayload,
  type ServerWsMessage,
} from '@pgmd/shared'
import type WebSocket from 'ws'

const wsOpenState = 1

type SocketSet = Set<WebSocket>

const sendServerMessage = (socket: WebSocket, message: ServerWsMessage): void => {
  if (socket.readyState !== wsOpenState) {
    return
  }

  socket.send(JSON.stringify(serverWsMessageSchema.parse(message)))
}

const parseRawMessage = (raw: Buffer | ArrayBuffer | Buffer[]): unknown => {
  if (raw instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(raw).toString('utf8'))
  }

  if (Array.isArray(raw)) {
    return JSON.parse(Buffer.concat(raw).toString('utf8'))
  }

  return JSON.parse(raw.toString('utf8'))
}

export interface WsHub {
  onOpen: (socket: WebSocket) => void
  onMessage: (socket: WebSocket, raw: Buffer | ArrayBuffer | Buffer[]) => void
  onClose: (socket: WebSocket) => void
  broadcastExecutionUpdate: (payload: ExecutionUpdatePayload) => void
}

export const createWsHub = (): WsHub => {
  const subscriptionsByDocumentId = new Map<string, SocketSet>()

  const subscribe = (socket: WebSocket, documentId: string): void => {
    const existing = subscriptionsByDocumentId.get(documentId)

    if (existing) {
      existing.add(socket)
    } else {
      subscriptionsByDocumentId.set(documentId, new Set([socket]))
    }

    sendServerMessage(socket, {
      type: 'server.subscription.changed',
      documentId,
      subscribed: true,
    })
  }

  const unsubscribe = (socket: WebSocket, documentId: string): void => {
    const existing = subscriptionsByDocumentId.get(documentId)

    if (existing === undefined) {
      return
    }

    existing.delete(socket)

    if (existing.size === 0) {
      subscriptionsByDocumentId.delete(documentId)
    }

    sendServerMessage(socket, {
      type: 'server.subscription.changed',
      documentId,
      subscribed: false,
    })
  }

  const onClose = (socket: WebSocket): void => {
    for (const [documentId, sockets] of subscriptionsByDocumentId.entries()) {
      sockets.delete(socket)

      if (sockets.size === 0) {
        subscriptionsByDocumentId.delete(documentId)
      }
    }
  }

  return {
    onOpen: (socket) => {
      sendServerMessage(socket, {
        type: 'server.ready',
        message: 'Realtime channel connected',
      })
    },
    onMessage: (socket, raw) => {
      try {
        const parsedMessage = clientWsMessageSchema.parse(parseRawMessage(raw))

        switch (parsedMessage.type) {
          case 'ping':
            sendServerMessage(socket, { type: 'server.pong' })
            break
          case 'subscribe.document':
            subscribe(socket, parsedMessage.documentId)
            break
          case 'unsubscribe.document':
            unsubscribe(socket, parsedMessage.documentId)
            break
        }
      } catch (error) {
        sendServerMessage(socket, {
          type: 'server.error',
          message: error instanceof Error ? error.message : 'Invalid websocket message',
        })
      }
    },
    onClose,
    broadcastExecutionUpdate: (payload) => {
      const subscribedSockets = subscriptionsByDocumentId.get(payload.documentId)

      if (subscribedSockets === undefined) {
        return
      }

      for (const socket of subscribedSockets) {
        sendServerMessage(socket, {
          type: 'execution.updated',
          payload,
        })
      }
    },
  }
}
