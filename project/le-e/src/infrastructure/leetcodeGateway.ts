import { env as processEnvironment } from 'node:process'

import { RUNTIME_CONFIG } from '../config/runtime'
import { ERROR_CODES } from '../domain/errors'
import type { AppError, AppResult } from '../domain/errors'
import type { CommandResult, ParsedRunResult } from '../domain/operation'
import type { ParsedProblemList, ProblemDetail } from '../domain/problem'
import type { ChineseProblemCatalog } from './chineseProblemCatalog'
import { parseProblemDetail } from './parsers/detailParser'
import { parseProblemList } from './parsers/listParser'
import { sanitizeOutput } from './parsers/outputSanitizer'
import { parseRunResult } from './parsers/runResultParser'
import { ProcessSpawnError } from './processRunner'
import type { CapturedProcessRequest, ProcessRunner } from './processRunner'

const VERIFIED_VERSION = '0.5.4'
const VERSION_PATTERN = /\bleetcode\s+(?<version>\d+\.\d+\.\d+)\b/i
const EXPLICIT_AUTH_ERROR =
  /(?:cookies? seems expired|please make sure you have logined|maybe you not login|authentication required|unauthorized)/i
const SITE_OR_NETWORK_ERROR =
  /(?:error sending request|network issue|dns|connection (?:failed|refused|reset)|tls|certificate|request timed out|http status|failed to download)/i

export interface GatewayLogChunk {
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
}

export interface GatewayCallOptions {
  readonly signal?: AbortSignal
  readonly onLogChunk?: (chunk: GatewayLogChunk) => void
}

export interface GatewayEditOptions extends GatewayCallOptions {
  readonly bridgeEnvironment?: Readonly<Record<string, string>>
}

export interface CliVersionInfo {
  readonly version: string
  readonly supported: boolean
}

export interface GatewayRunValue {
  readonly command: CommandResult
  readonly result: ParsedRunResult
}

export interface LeetCodeGateway {
  preflight(options?: GatewayCallOptions): Promise<AppResult<CliVersionInfo>>
  listProblems(options?: GatewayCallOptions): Promise<AppResult<ParsedProblemList>>
  listStarred(options?: GatewayCallOptions): Promise<AppResult<ParsedProblemList>>
  loadDetail(id: number, options?: GatewayCallOptions): Promise<AppResult<ProblemDetail>>
  edit(id: number, options?: GatewayEditOptions): Promise<AppResult<CommandResult>>
  test(id: number, options?: GatewayCallOptions): Promise<AppResult<GatewayRunValue>>
  submit(id: number, options?: GatewayCallOptions): Promise<AppResult<GatewayRunValue>>
}

export interface CreateLeetCodeGatewayOptions {
  readonly runner: ProcessRunner
  readonly command?: string
  readonly now?: () => number
  readonly chineseCatalog?: ChineseProblemCatalog
}

interface SafeForwarder {
  push(chunk: string): void
  flush(): void
}

function createSafeForwarder(
  stream: GatewayLogChunk['stream'],
  onLogChunk: (chunk: GatewayLogChunk) => void,
): SafeForwarder {
  let pending = ''

  const emit = (text: string): void => {
    const sanitized = sanitizeOutput(text)
    onLogChunk({ stream, text: sanitized.text })
  }

  return {
    push(chunk) {
      pending += chunk.replace(/\r\n?/g, '\n')
      let newlineIndex = pending.indexOf('\n')
      while (newlineIndex >= 0) {
        emit(`${pending.slice(0, newlineIndex)}\n`)
        pending = pending.slice(newlineIndex + 1)
        newlineIndex = pending.indexOf('\n')
      }
    },
    flush() {
      if (pending === '') return
      emit(pending)
      pending = ''
    },
  }
}

function safeCommandResult(result: CommandResult): CommandResult {
  const stdout = sanitizeOutput(result.stdout)
  const stderr = sanitizeOutput(result.stderr)
  return {
    ...result,
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: result.truncated || stdout.truncated || stderr.truncated,
  }
}

function commandDetail(result: CommandResult): string {
  return [result.stderr, result.stdout]
    .filter((value) => value.trim() !== '')
    .join('\n')
    .trim()
}

function commandError(result: CommandResult, submit: boolean): AppError | null {
  const detail = commandDetail(result)

  if (result.timedOut) {
    return {
      code: submit ? ERROR_CODES.submitUnknown : ERROR_CODES.commandTimeout,
      message: submit
        ? 'The submission may have been sent, but its final status is unknown.'
        : 'The LeetCode command timed out.',
      detail: detail || `Command exceeded its ${RUNTIME_CONFIG.timeoutsMs.remote} ms limit.`,
    }
  }

  if (result.cancelled) {
    return {
      code: submit ? ERROR_CODES.submitUnknown : ERROR_CODES.commandCancelled,
      message: submit
        ? 'The submission was interrupted and its final status is unknown.'
        : 'The LeetCode command was cancelled.',
      detail: detail || 'The child process was terminated before completion.',
    }
  }

  if (result.exitCode === 0 && result.signal === null) return null

  if (EXPLICIT_AUTH_ERROR.test(detail)) {
    return {
      code: ERROR_CODES.authRequired,
      message: 'LeetCode authentication is required or has expired.',
      detail,
    }
  }

  if (SITE_OR_NETWORK_ERROR.test(detail)) {
    return {
      code: ERROR_CODES.siteOrNetwork,
      message: 'The configured LeetCode site or network request failed.',
      detail,
    }
  }

  if (submit && result.signal !== null) {
    return {
      code: ERROR_CODES.submitUnknown,
      message: 'The submission process ended before a final status was observed.',
      detail: detail || `Process ended with signal ${result.signal}.`,
    }
  }

  return {
    code: ERROR_CODES.commandFailed,
    message: 'The LeetCode command failed.',
    detail:
      detail ||
      `Process ended with ${
        result.signal === null ? `exit code ${String(result.exitCode)}` : `signal ${result.signal}`
      }.`,
  }
}

function spawnError(error: unknown): AppError {
  if (error instanceof ProcessSpawnError && error.code === 'ENOENT') {
    return {
      code: ERROR_CODES.cliNotFound,
      message: 'The leetcode executable was not found in PATH.',
      detail: error.message,
    }
  }

  return {
    code: ERROR_CODES.commandFailed,
    message: 'The LeetCode command could not be started.',
    detail: error instanceof Error ? error.message : String(error),
  }
}

function invalidId(id: number): AppResult<never> | null {
  if (Number.isSafeInteger(id) && id > 0) return null
  return {
    ok: false,
    error: {
      code: ERROR_CODES.commandFailed,
      message: 'A positive integer problem ID is required.',
    },
  }
}

export function createLeetCodeGateway({
  runner,
  command = 'leetcode',
  now = Date.now,
  chineseCatalog,
}: CreateLeetCodeGatewayOptions): LeetCodeGateway {
  const ambiguousProblemIds = new Set<number>()
  const warnChineseFallback = (options: GatewayCallOptions): void => {
    options.onLogChunk?.({
      stream: 'stderr',
      text: '中文题库暂时不可用，本次显示 CLI 原文。\n',
    })
  }

  const localizeProblemList = async (
    parsed: AppResult<ParsedProblemList>,
    options: GatewayCallOptions,
  ): Promise<AppResult<ParsedProblemList>> => {
    if (!parsed.ok || chineseCatalog === undefined) return parsed
    try {
      const localizations = await chineseCatalog.list(options.signal)
      const localize = (problem: ParsedProblemList['summaries'][number]) => {
        if (ambiguousProblemIds.has(problem.id)) return problem
        const localized = localizations.get(problem.id)
        return localized === undefined
          ? problem
          : { ...problem, localizedTitle: localized.title, slug: localized.slug }
      }
      return {
        ok: true,
        value: {
          ...parsed.value,
          summaries: parsed.value.summaries.map(localize),
          collisionCandidates: new Map(
            [...parsed.value.collisionCandidates].map(([id, candidates]) => [
              id,
              candidates.map(localize),
            ]),
          ),
        },
      }
    } catch {
      warnChineseFallback(options)
      return parsed
    }
  }

  const executeCaptured = async (
    args: readonly string[],
    timeoutMs: number | undefined,
    options: GatewayCallOptions = {},
    submit = false,
    environment?: Readonly<Record<string, string>>,
  ): Promise<AppResult<CommandResult>> => {
    const stdoutForwarder =
      options.onLogChunk === undefined
        ? undefined
        : createSafeForwarder('stdout', options.onLogChunk)
    const stderrForwarder =
      options.onLogChunk === undefined
        ? undefined
        : createSafeForwarder('stderr', options.onLogChunk)
    const request: CapturedProcessRequest = { command, args }

    if (timeoutMs !== undefined) Object.assign(request, { timeoutMs })
    if (options.signal !== undefined) Object.assign(request, { signal: options.signal })
    if (environment !== undefined) {
      Object.assign(request, { env: { ...processEnvironment, ...environment } })
    }
    if (stdoutForwarder !== undefined) {
      Object.assign(request, { onStdoutChunk: (chunk: string) => stdoutForwarder.push(chunk) })
    }
    if (stderrForwarder !== undefined) {
      Object.assign(request, { onStderrChunk: (chunk: string) => stderrForwarder.push(chunk) })
    }

    try {
      const result = safeCommandResult(await runner.runCaptured(request))
      stdoutForwarder?.flush()
      stderrForwarder?.flush()
      const error = commandError(result, submit)
      return error === null ? { ok: true, value: result } : { ok: false, error }
    } catch (error) {
      stdoutForwarder?.flush()
      stderrForwarder?.flush()
      return { ok: false, error: spawnError(error) }
    }
  }

  return {
    async preflight(options = {}) {
      const executed = await executeCaptured(
        ['--version'],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      if (!executed.ok) return executed

      const match = VERSION_PATTERN.exec(`${executed.value.stdout}\n${executed.value.stderr}`)
      const version = match?.groups?.version
      if (version === undefined) {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.parse,
            message: 'The LeetCode CLI version output could not be parsed.',
          },
        }
      }
      return { ok: true, value: { version, supported: version === VERIFIED_VERSION } }
    },

    async listProblems(options = {}) {
      const executed = await executeCaptured(['list'], RUNTIME_CONFIG.timeoutsMs.standard, options)
      if (!executed.ok) return executed
      const parsed = parseProblemList(executed.value.stdout)
      if (parsed.ok) {
        ambiguousProblemIds.clear()
        for (const id of parsed.value.collisionCandidates.keys()) ambiguousProblemIds.add(id)
      }
      return localizeProblemList(parsed, options)
    },

    async listStarred(options = {}) {
      const executed = await executeCaptured(
        ['list', '-q', 's'],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      return executed.ok
        ? localizeProblemList(parseProblemList(executed.value.stdout, { starred: true }), options)
        : executed
    },

    async loadDetail(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const executed = await executeCaptured(
        ['pick', String(id)],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      if (!executed.ok) return executed
      const parsed = parseProblemDetail(executed.value.stdout, id, now())
      if (!parsed.ok || chineseCatalog === undefined || ambiguousProblemIds.has(id)) return parsed
      try {
        const localized = await chineseCatalog.loadDetail(id, options.signal)
        return localized === null
          ? parsed
          : {
              ok: true,
              value: {
                ...parsed.value,
                localizedTitle: localized.title,
                statement: localized.statement,
              },
            }
      } catch {
        warnChineseFallback(options)
        return parsed
      }
    },

    async edit(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      if (options.bridgeEnvironment !== undefined) {
        return executeCaptured(
          ['edit', String(id), '--lang', RUNTIME_CONFIG.language],
          undefined,
          options,
          false,
          options.bridgeEnvironment,
        )
      }
      const request = {
        command,
        args: ['edit', String(id), '--lang', RUNTIME_CONFIG.language],
      }
      if (options.signal !== undefined) Object.assign(request, { signal: options.signal })

      try {
        const result = safeCommandResult(await runner.runInherited(request))
        const error = commandError(result, false)
        return error === null ? { ok: true, value: result } : { ok: false, error }
      } catch (error) {
        return { ok: false, error: spawnError(error) }
      }
    },

    async test(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const executed = await executeCaptured(
        ['test', String(id)],
        RUNTIME_CONFIG.timeoutsMs.remote,
        options,
      )
      return executed.ok
        ? {
            ok: true,
            value: {
              command: executed.value,
              result: parseRunResult(executed.value.stdout, 'test'),
            },
          }
        : executed
    },

    async submit(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const executed = await executeCaptured(
        ['exec', String(id)],
        RUNTIME_CONFIG.timeoutsMs.remote,
        options,
        true,
      )
      return executed.ok
        ? {
            ok: true,
            value: {
              command: executed.value,
              result: parseRunResult(executed.value.stdout, 'submit'),
            },
          }
        : executed
    },
  }
}
