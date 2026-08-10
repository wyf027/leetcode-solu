import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'

import { RUNTIME_CONFIG } from '../config/runtime'
import {
  EDITOR_BRIDGE_MAX_MESSAGE_BYTES,
  EDITOR_BRIDGE_PROTOCOL_VERSION,
  EDITOR_BRIDGE_SOCKET_ENV,
  EDITOR_BRIDGE_TOKEN_ENV,
  EditorBridgeProtocolError,
  encodeBridgeMessage,
  parseBridgeOpenMessage,
} from './editorBridgeProtocol'

export interface SourceBridgeOpenRequest {
  readonly path: string
}

export interface SourceBridgeSession {
  readonly socketPath: string
  readonly environment: Readonly<Record<string, string>>
  waitForOpen(): Promise<SourceBridgeOpenRequest>
  complete(): Promise<void>
  reject(message: string): Promise<void>
  dispose(): Promise<void>
}

export interface CreateSourceBridgeOptions {
  readonly signal?: AbortSignal
  readonly handshakeTimeoutMs?: number
}

function sameToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
}

function writeAndEnd(socket: Socket, payload: string): Promise<void> {
  return new Promise((resolve) => {
    if (socket.destroyed) {
      resolve()
      return
    }
    socket.end(payload, resolve)
  })
}

export async function createSourceBridgeSession(
  options: CreateSourceBridgeOptions = {},
): Promise<SourceBridgeSession> {
  const directory = await mkdtemp(join(tmpdir(), 'le-e-bridge-'))
  await chmod(directory, 0o700)
  const socketPath = join(directory, 'editor.sock')
  const token = randomBytes(32).toString('hex')
  let activeSocket: Socket | undefined
  let disposed = false
  let settled = false
  let resolveOpen: ((request: SourceBridgeOpenRequest) => void) | undefined
  let rejectOpen: ((error: Error) => void) | undefined

  const opened = new Promise<SourceBridgeOpenRequest>((resolve, reject) => {
    resolveOpen = resolve
    rejectOpen = reject
  })

  const server = createServer((socket) => {
    if (activeSocket !== undefined || settled || disposed) {
      socket.end(
        encodeBridgeMessage({
          version: EDITOR_BRIDGE_PROTOCOL_VERSION,
          type: 'reject',
          message: 'Another editor bridge is already attached.',
        }),
      )
      return
    }

    activeSocket = socket
    socket.setEncoding('utf8')
    let pending = ''

    socket.on('data', (chunk: string) => {
      if (settled) return
      pending += chunk
      if (Buffer.byteLength(pending, 'utf8') > EDITOR_BRIDGE_MAX_MESSAGE_BYTES) {
        settled = true
        rejectOpen?.(new EditorBridgeProtocolError('Bridge handshake exceeded the size limit.'))
        socket.destroy()
        return
      }

      const newline = pending.indexOf('\n')
      if (newline < 0) return

      try {
        const message = parseBridgeOpenMessage(pending.slice(0, newline))
        if (!sameToken(message.token, token)) {
          throw new EditorBridgeProtocolError('Bridge session token was invalid.')
        }
        settled = true
        socket.write(
          encodeBridgeMessage({ version: EDITOR_BRIDGE_PROTOCOL_VERSION, type: 'ready' }),
        )
        resolveOpen?.({ path: message.path })
      } catch (error) {
        settled = true
        rejectOpen?.(error instanceof Error ? error : new Error(String(error)))
        socket.end(
          encodeBridgeMessage({
            version: EDITOR_BRIDGE_PROTOCOL_VERSION,
            type: 'reject',
            message: 'The editor bridge handshake was rejected.',
          }),
        )
      }
    })

    socket.once('error', (error) => {
      if (settled) return
      settled = true
      rejectOpen?.(error)
    })

    socket.once('close', () => {
      if (!settled) {
        settled = true
        rejectOpen?.(new EditorBridgeProtocolError('Editor bridge disconnected before opening.'))
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  }).catch(async (error: unknown) => {
    await rm(directory, { recursive: true, force: true })
    throw error
  })

  const failOpen = (error: Error): void => {
    if (settled) return
    settled = true
    rejectOpen?.(error)
    activeSocket?.destroy()
  }

  const timeout = setTimeout(
    () => failOpen(new EditorBridgeProtocolError('Editor bridge did not connect in time.')),
    options.handshakeTimeoutMs ?? RUNTIME_CONFIG.editorBridgeHandshakeMs,
  )
  timeout.unref()

  const onAbort = (): void =>
    failOpen(new EditorBridgeProtocolError('Editor bridge was cancelled.'))
  options.signal?.addEventListener('abort', onAbort, { once: true })

  const finish = async (type: 'close' | 'reject', message?: string): Promise<void> => {
    if (disposed) return
    const socket = activeSocket
    if (socket === undefined) return
    const payload =
      type === 'close'
        ? encodeBridgeMessage({ version: EDITOR_BRIDGE_PROTOCOL_VERSION, type })
        : encodeBridgeMessage({
            version: EDITOR_BRIDGE_PROTOCOL_VERSION,
            type,
            message: message ?? 'The source file was rejected.',
          })
    await writeAndEnd(socket, payload)
  }

  const dispose = async (): Promise<void> => {
    if (disposed) return
    disposed = true
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onAbort)
    activeSocket?.destroy()
    await closeServer(server)
    await rm(directory, { recursive: true, force: true })
  }

  void opened.finally(() => clearTimeout(timeout)).catch(() => {})

  return {
    socketPath,
    environment: {
      [EDITOR_BRIDGE_SOCKET_ENV]: socketPath,
      [EDITOR_BRIDGE_TOKEN_ENV]: token,
    },
    waitForOpen() {
      return opened
    },
    complete() {
      return finish('close')
    },
    reject(message) {
      return finish('reject', message)
    },
    dispose,
  }
}
