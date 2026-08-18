export const EDITOR_BRIDGE_PROTOCOL_VERSION = 1
export const EDITOR_BRIDGE_MAX_MESSAGE_BYTES = 8 * 1024
export const EDITOR_BRIDGE_SOCKET_ENV = 'LE_E_EDITOR_SOCKET'
export const EDITOR_BRIDGE_TOKEN_ENV = 'LE_E_EDITOR_TOKEN'

export interface EditorBridgeOpenMessage {
  readonly version: typeof EDITOR_BRIDGE_PROTOCOL_VERSION
  readonly type: 'open'
  readonly token: string
  readonly path: string
}

export type EditorBridgeServerMessage =
  | {
      readonly version: typeof EDITOR_BRIDGE_PROTOCOL_VERSION
      readonly type: 'ready' | 'close'
    }
  | {
      readonly version: typeof EDITOR_BRIDGE_PROTOCOL_VERSION
      readonly type: 'reject'
      readonly message: string
    }

export class EditorBridgeProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorBridgeProtocolError'
  }
}

function parseObject(line: string): Record<string, unknown> {
  if (Buffer.byteLength(line, 'utf8') > EDITOR_BRIDGE_MAX_MESSAGE_BYTES) {
    throw new EditorBridgeProtocolError('Bridge message exceeded the size limit.')
  }

  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new EditorBridgeProtocolError('Bridge message was not valid JSON.')
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new EditorBridgeProtocolError('Bridge message must be a JSON object.')
  }
  return value as Record<string, unknown>
}

export function encodeBridgeMessage(
  message: EditorBridgeOpenMessage | EditorBridgeServerMessage,
): string {
  return `${JSON.stringify(message)}\n`
}

export function parseBridgeOpenMessage(line: string): EditorBridgeOpenMessage {
  const value = parseObject(line)
  if (
    value.version !== EDITOR_BRIDGE_PROTOCOL_VERSION ||
    value.type !== 'open' ||
    typeof value.token !== 'string' ||
    value.token.length < 32 ||
    typeof value.path !== 'string' ||
    value.path.length === 0
  ) {
    throw new EditorBridgeProtocolError('Bridge open message had an invalid shape.')
  }
  return {
    version: EDITOR_BRIDGE_PROTOCOL_VERSION,
    type: 'open',
    token: value.token,
    path: value.path,
  }
}

export function parseBridgeServerMessage(line: string): EditorBridgeServerMessage {
  const value = parseObject(line)
  if (value.version !== EDITOR_BRIDGE_PROTOCOL_VERSION) {
    throw new EditorBridgeProtocolError('Bridge server version was unsupported.')
  }
  if (value.type === 'ready' || value.type === 'close') {
    return { version: EDITOR_BRIDGE_PROTOCOL_VERSION, type: value.type }
  }
  if (value.type === 'reject' && typeof value.message === 'string') {
    return {
      version: EDITOR_BRIDGE_PROTOCOL_VERSION,
      type: 'reject',
      message: value.message,
    }
  }
  throw new EditorBridgeProtocolError('Bridge server message had an invalid shape.')
}
