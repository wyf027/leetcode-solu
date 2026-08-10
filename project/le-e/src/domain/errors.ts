export const ERROR_CODES = {
  cliNotFound: 'CLI_NOT_FOUND',
  cliVersionUnsupported: 'CLI_VERSION_UNSUPPORTED',
  authRequired: 'AUTH_REQUIRED',
  siteOrNetwork: 'SITE_OR_NETWORK_ERROR',
  commandTimeout: 'COMMAND_TIMEOUT',
  commandCancelled: 'COMMAND_CANCELLED',
  commandFailed: 'COMMAND_FAILED',
  parse: 'PARSE_ERROR',
  submitUnknown: 'SUBMIT_STATUS_UNKNOWN',
  terminalRestore: 'TERMINAL_RESTORE_FAILED',
  editorBridgeNotConfigured: 'EDITOR_BRIDGE_NOT_CONFIGURED',
  editorBridgeProtocol: 'EDITOR_BRIDGE_PROTOCOL_ERROR',
  sourceFileRejected: 'SOURCE_FILE_REJECTED',
  sourceFileChanged: 'SOURCE_FILE_CHANGED',
  sourceSaveFailed: 'SOURCE_SAVE_FAILED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface AppError {
  readonly code: ErrorCode
  readonly message: string
  readonly detail?: string
}

export type AppResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError }
