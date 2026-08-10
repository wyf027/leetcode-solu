import { spawn } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { createConnection } from 'node:net'
import type { Socket } from 'node:net'
import { env as processEnvironment } from 'node:process'

import {
  EDITOR_BRIDGE_MAX_MESSAGE_BYTES,
  EDITOR_BRIDGE_PROTOCOL_VERSION,
  EDITOR_BRIDGE_SOCKET_ENV,
  EDITOR_BRIDGE_TOKEN_ENV,
  EditorBridgeProtocolError,
  encodeBridgeMessage,
  parseBridgeServerMessage,
} from './infrastructure/editorBridgeProtocol'
import { readEditorFallbackConfig } from './infrastructure/editorSetup'

function safeErrorMessage(error: unknown): string {
  if (error instanceof EditorBridgeProtocolError) return error.message
  return 'The le-e editor bridge could not complete the editor handoff.'
}

function waitForSocketClose(socket: Socket, path: string, token: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    let pending = ''
    let ready = false
    let completed = false

    const fail = (error: Error): void => {
      socket.destroy()
      reject(error)
    }

    socket.setEncoding('utf8')
    socket.once('connect', () => {
      socket.write(
        encodeBridgeMessage({
          version: EDITOR_BRIDGE_PROTOCOL_VERSION,
          type: 'open',
          token,
          path,
        }),
      )
    })
    socket.on('data', (chunk: string) => {
      pending += chunk
      if (Buffer.byteLength(pending, 'utf8') > EDITOR_BRIDGE_MAX_MESSAGE_BYTES) {
        fail(new EditorBridgeProtocolError('Bridge server response exceeded the size limit.'))
        return
      }

      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        const message = parseBridgeServerMessage(line)
        if (message.type === 'reject') {
          fail(new EditorBridgeProtocolError(message.message))
          return
        }
        if (!ready && message.type === 'ready') ready = true
        else if (ready && message.type === 'close') {
          completed = true
          socket.end()
          resolvePromise()
          return
        } else {
          fail(new EditorBridgeProtocolError('Bridge server messages arrived out of order.'))
          return
        }
        newline = pending.indexOf('\n')
      }
    })
    socket.once('error', (error) => fail(error))
    socket.once('close', () => {
      if (!completed) {
        reject(
          new EditorBridgeProtocolError('Bridge socket closed before the editor was released.'),
        )
      }
    })
  })
}

function runFallbackEditor(editor: string, args: readonly string[]): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(editor, [...args], { shell: false, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal !== null) {
        resolvePromise(1)
        return
      }
      resolvePromise(code ?? 1)
    })
  })
}

function safeFallbackEditor(configured: string | undefined): string {
  const candidate = configured?.trim() || 'vim'
  const ownPath = resolve(process.argv[1] ?? '')
  if (resolve(candidate) === ownPath || basename(candidate) === 'le-e-editor') return 'vim'
  return candidate
}

export async function runEditorBridge(args = process.argv.slice(2)): Promise<number> {
  const sourcePath = args.at(-1)
  if (sourcePath === undefined || sourcePath === '') {
    throw new EditorBridgeProtocolError('The LeetCode CLI did not provide a source file path.')
  }

  const socketPath = processEnvironment[EDITOR_BRIDGE_SOCKET_ENV]
  const token = processEnvironment[EDITOR_BRIDGE_TOKEN_ENV]
  if (socketPath !== undefined && token !== undefined) {
    await waitForSocketClose(createConnection(socketPath), sourcePath, token)
    return 0
  }

  const fallback = await readEditorFallbackConfig()
  const editor = safeFallbackEditor(fallback?.fallbackEditor)
  return runFallbackEditor(editor, args)
}

void runEditorBridge()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`${safeErrorMessage(error)}\n`)
    process.exitCode = 1
  })
