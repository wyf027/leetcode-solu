export type OperationKind =
  | 'preflight'
  | 'refresh-list'
  | 'refresh-starred'
  | 'load-detail'
  | 'edit'
  | 'test'
  | 'submit'
  | 'favorite'

export interface CommandResult {
  readonly command: string
  readonly args: readonly string[]
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly durationMs: number
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly truncated: boolean
}

export interface OutputLimits {
  readonly lineBytes: number
  readonly streamBytes: number
}

export interface SanitizedOutput {
  readonly text: string
  readonly truncated: boolean
}

export interface FailedTestCase {
  readonly input?: string
  readonly actual?: string
  readonly expected?: string
}

export type ParsedRunResult =
  | {
      readonly kind: 'test'
      readonly outcome: 'passed' | 'failed' | 'unknown'
      readonly message: string
      readonly truncated: boolean
      readonly failedCase?: FailedTestCase
    }
  | {
      readonly kind: 'submit'
      readonly outcome: 'accepted' | 'rejected' | 'unknown'
      readonly message: string
      readonly truncated: boolean
    }

export type ParsedTestResult = Extract<ParsedRunResult, { readonly kind: 'test' }>
